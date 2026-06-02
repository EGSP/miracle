/**
 * Модель durable-движка задач (см. фреймворк в `back-nest/src/jobs/framework` и лекцию
 * `.agents/plans/nest-migration/worker-rework`).
 *
 * Единица работы — Job (описание, компилируемое в Effect). Запись об исполнении — плоский
 * {@link JobRun}: дерево не хранится внутри записи, а выражается ссылкой `parentId` на родителя.
 * Дочерние прогоны дедуплицируются парой `(parentId, key)`.
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Брендированный идентификатор Job. Нельзя подставить произвольную строку — только значение,
 * полученное из `defineJob(id, …)` (который брендирует через приведение).
 */
export type JobId = string & { readonly __job: unique symbol };

/** Прогресс джоба (наблюдаемость, не состояние для возобновления). Пишется через сервис `Progress`. */
export type JobProgress = {
    /** 0..100. */
    pct: number;
    /** Необязательная подпись текущего этапа для UI. */
    label?: string;
};

/**
 * Запись об исполнении одного Job — плоская.
 *
 * Связь с деревом — через `parentId` (id непосредственного родителя; `null` у корня) и `key`
 * (ключ идемпотентности в пределах родителя; `null` у корня). Пара `(parentId, key)` уникальна.
 * Завершённый (`succeeded`) прогон переиспользует свой `output` при повторном запросе родителем.
 *
 * @example корневой прогон
 * ```json
 * { "id": "run_1", "job": "order-analyse", "parentId": null, "key": null, "status": "running" }
 * ```
 * @example дочерний прогон
 * ```json
 * { "id": "run_2", "job": "extract-text", "parentId": "run_1", "key": "extract", "status": "succeeded", "output": "…" }
 * ```
 */
export type JobRun = {
    id: string;
    /** Идентификатор Job (ключ в реестре). */
    job: JobId;
    /** id непосредственного родителя; `null` у корневого прогона. */
    parentId?: string | null;
    /** Ключ идемпотентности в пределах родителя; `null` у корня. */
    key?: string | null;
    status: JobStatus;
    input?: unknown;
    /** Для `succeeded` — выход; переиспользуется при повторном запуске родителем. */
    output?: unknown;
    /** Для `failed` — сообщение об ошибке. */
    error?: string;
    progress?: JobProgress;
    /** Контрольная точка возобновления внутри джоба, напр. `{ opId, finalPrompt }`. */
    memo?: Record<string, unknown>;
};
