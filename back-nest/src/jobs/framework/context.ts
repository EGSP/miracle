import { Context, type Effect, type Option } from 'effect';
import type { JobKey, JobProgress } from '@miracle/types';
import type { Job } from './job.js';

/**
 * Контрольная точка (memo) текущего джоба. Реализацию даёт рантайм, привязав её к строке прогона:
 * `set` пишет значение в `memo` записи и сразу персистит (durable). Нужна, чтобы пережить рестарт
 * внутри одного джоба — например, запомнить id отправленной облачной операции до начала опроса.
 *
 * @example
 * ```ts
 * const memo = yield* Memo;
 * const saved = yield* memo.get<string>('opId');
 * if (Option.isNone(saved)) {
 *   const opId = yield* Effect.tryPromise(() => llm.submit(prompt));
 *   yield* memo.set('opId', opId); // durable ДО опроса
 * }
 * ```
 */
export class Memo extends Context.Tag('jobs/Memo')<
    Memo,
    {
        readonly get: <Value>(key: string) => Effect.Effect<Option.Option<Value>>;
        readonly set: <Value>(key: string, value: Value) => Effect.Effect<void>;
    }
>() {}

/**
 * Отчёт о прогрессе текущего джоба (только наблюдаемость, не состояние для возобновления).
 * `set` пишет процент (0..100) и необязательную подпись в `progress` записи. Общий прогресс
 * по дереву собирается отдельно рекурсивным обходом потомков по `parentId`.
 *
 * @example
 * ```ts
 * const progress = yield* Progress;
 * yield* progress.set(50, 'опрос LLM');
 * ```
 */
export class Progress extends Context.Tag('jobs/Progress')<
    Progress,
    {
        readonly set: (pct: number, label?: string) => Effect.Effect<void>;
    }
>() {}

/**
 * Запуск дочерних джобов. `run(job, key, input)` находит-или-создаёт прогон по глобальной
 * идентичности `keyHash = hashKey(key)`. Если прогон уже `succeeded` — мгновенно возвращается
 * его `output`; иначе тело исполняется (`parentId` проставляется в текущий узел только для
 * навигации по дереву).
 *
 * Ключ — структурный массив ({@link JobKey}), который собирает РОДИТЕЛЬ из своего скоупа.
 * Чтобы ребёнок был глобально уникален внутри своего поддерева, в ключ кладут `runId` —
 * id текущего (родительского) прогона: `[jobs.runId, 'сегмент']`.
 *
 * @example
 * ```ts
 * const jobs = yield* Jobs;
 * const a = yield* jobs.run(stepA, [jobs.runId, 'a'], input);
 * // параллельные дети — разные сегменты:
 * const [x, y] = yield* Effect.all(
 *   [jobs.run(stepX, [jobs.runId, 'x'], a), jobs.run(stepY, [jobs.runId, 'y'], a)],
 *   { concurrency: 'unbounded' },
 * );
 * ```
 */
export class Jobs extends Context.Tag('jobs/Jobs')<
    Jobs,
    {
        /** id текущего (исполняющегося) прогона — родитель кладёт его в ключ ребёнка для уникальности. */
        readonly runId: string;
        readonly run: <Input, Output>(
            job: Job<Input, Output>,
            key: JobKey,
            input: Input,
        ) => Effect.Effect<Output, unknown>;
    }
>() {}
