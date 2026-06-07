/**
 * Модель durable-движка задач (см. фреймворк в `back-nest/src/jobs/framework` и план
 * `.agents/plans/jobs`).
 *
 * Единица работы — Job (описание, компилируемое в Effect). Запись об исполнении — плоский
 * {@link JobRun}: дерево не хранится внутри записи, а выражается ссылкой `parentId` на родителя.
 * Идентичность прогона — глобальный {@link JobRun.keyHash} (канонический хеш ключа-массива
 * {@link JobKey}); `parentId` к идентичности не относится и нужен только для навигации по дереву.
 */

/**
 * Статус прогона.
 *
 * `partial` — терминальный статус для оркестраторов с веером дочерних прогонов (best-effort):
 * часть детей упала, часть прошла. Заказ/приложение при этом считается выполненным частично, а не
 * проваленным. Применим только к джобам, которые сами решают этот исход (`analyse-order`,
 * `analyse-application`); листовые джобы (напр. `extract-positions-from-chunk`) его не используют —
 * у них только `succeed`/`failed`.
 *
 * Правило агрегации: все дети упали → `failed`; есть и упавшие, и успешные → `partial`; все успешны
 * → `succeed`. Для РОДИТЕЛЯ `partial` равнозначен провалу: дочерний прогон в статусе `partial`
 * учитывается как неуспешный при сведении и переисполняется только явной командой (как `failed`).
 * На UI отличается лишь цветом (оранжевый против красного).
 */
export type JobStatus = 'queued' | 'running' | 'succeed' | 'partial' | 'failed' | 'cancelled';

/**
 * Брендированный идентификатор Job. Нельзя подставить произвольную строку — только значение,
 * полученное из `defineJob(id, …)` (который брендирует через приведение).
 */
export type JobId = string & { readonly __job: unique symbol };

/** Элемент ключа прогона: JSON-сериализуемое значение (как в ключах TanStack Query). */
export type JobKeyPart =
    | string
    | number
    | boolean
    | null
    | { readonly [key: string]: JobKeyPart }
    | readonly JobKeyPart[];

/**
 * Структурный ключ прогона — массив частей (стиль TanStack Query). Порядок элементов значим
 * (выражает иерархию/контекст). Идентичность задаёт не сам массив, а его канонический хеш
 * ({@link JobRun.keyHash}): объекты внутри ключа каноникализируются по отсортированным полям.
 *
 * Ключ формирует ВЫЗЫВАЮЩИЙ из своего скоупа: продьюсер — для корня; родитель — для ребёнка
 * (обычно `[jobs.runId, 'сегмент']`, чтобы быть глобально уникальным внутри своего поддерева).
 */
export type JobKey = ReadonlyArray<JobKeyPart>;

/** Один снимок прогресса джоба (элемент истории). */
export type JobProgressState = {
    /** Доля выполнения от 0 до 1. */
    percentNormalized: number;
    /** false — этап начат, длительность/доля внутри этапа неизвестна. */
    determined: boolean;
    /** Подпись текущего этапа для UI (короткое действие без пунктуации). */
    label: string;
    /** Момент фиксации снимка (epoch ms). */
    createdAt: number;
};

/**
 * Прогресс джоба (наблюдаемость, не состояние для возобновления). Пишется через сервис `Progress`.
 * Текущее состояние — последний элемент {@link JobProgress.states}.
 */
export type JobProgress = {
    states: JobProgressState[];
};

/** Параметры {@link pushJobProgressState} и {@link Progress.push}. */
export type JobProgressPushOptions = {
    label: string;
    /** false — этап с неизвестной длительностью (default `true`). */
    determined?: boolean;
    /**
     * Если `true` (по умолчанию) и `label` совпадает с последним снимком — перезаписать последний
     * элемент (или создать первый, если массив пуст). Иначе — добавить новый снимок в конец.
     */
    override?: boolean;
    /** Если не передан — берётся percent последнего state (или 0). */
    percentNormalized?: number;
};

/** Последний (текущий) снимок прогресса или `undefined`, если история пуста. */
export function latestJobProgressState(progress?: JobProgress): JobProgressState | undefined {
    return progress?.states.at(-1);
}

/**
 * Добавляет или обновляет снимок прогресса. Чистая функция — используется рантаймом и тестами.
 * @see JobProgressPushOptions.override
 */
export function pushJobProgressState(
    progress: JobProgress | undefined,
    percentOrOptions: number | JobProgressPushOptions,
    maybeOptions?: JobProgressPushOptions,
): JobProgress {
    const options: JobProgressPushOptions =
        typeof percentOrOptions === 'number' ? (maybeOptions as JobProgressPushOptions) : percentOrOptions;
    const last = progress?.states.at(-1);
    const percentNormalized =
        typeof percentOrOptions === 'number'
            ? percentOrOptions
            : (options.percentNormalized ?? last?.percentNormalized ?? 0);
    const { label, override = true, determined = true } = options;
    const state: JobProgressState = {
        percentNormalized,
        determined,
        label,
        createdAt: Date.now(),
    };

    const states = [...(progress?.states ?? [])];
    const lastInStates = states.at(-1);

    if (override && lastInStates !== undefined && lastInStates.label === label) {
        states[states.length - 1] = state;
    } else {
        states.push(state);
    }

    return { states };
}

/**
 * Запись об исполнении одного Job — плоская.
 *
 * Идентичность — {@link keyHash} (уникальный индекс): дедупликация/идемпотентность запусков
 * глобальная, а не «в пределах родителя». `parentId` (id непосредственного родителя; `null`
 * у корня) выражает дерево и используется только для навигации (обход, отмена, агрегация
 * прогресса). Завершённый (`succeed`) прогон переиспользует свой `output` при повторном вызове.
 *
 * @example корневой прогон
 * ```json
 * { "id": "run_1", "job": "order-analyse", "parentId": null,
 *   "key": ["order-analyse", "app_42"], "keyHash": "[\"order-analyse\",\"app_42\"]", "status": "running" }
 * ```
 * @example дочерний прогон
 * ```json
 * { "id": "run_2", "job": "extract-text", "parentId": "run_1",
 *   "key": ["run_1", "extract"], "keyHash": "[\"run_1\",\"extract\"]", "status": "succeed", "output": "…" }
 * ```
 */
export type JobRun = {
    id: string;
    /** Идентификатор Job (ключ в реестре). */
    job: JobId;
    /** id непосредственного родителя; `null` у корня. Только навигация по дереву, не идентичность. */
    parentId?: string | null;
    /** Структурный ключ-массив (читаемая форма). Идентичность задаёт {@link keyHash}. */
    key?: JobKey | null;
    /** Канонический хеш ключа — глобальная идентичность прогона (уникальный индекс). */
    keyHash: string;
    status: JobStatus;
    input?: unknown;
    /** Для `succeed` — выход; переиспользуется при повторном вызове. */
    output?: unknown;
    /** Для `failed` — сообщение об ошибке. */
    error?: string;
    progress?: JobProgress;
    /** Контрольная точка возобновления внутри джоба, напр. `{ opId, finalPrompt }`. */
    memo?: Record<string, unknown>;
};
