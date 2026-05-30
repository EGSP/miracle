import { Context, type Effect, type Option } from 'effect';
import type { JobProgress } from '@miracle/types';

/**
 * Контрольная точка (memo) текущего узла-листа. Реализацию даёт раннер (привязана к узлу JobRun):
 * `set` пишет в `memo` узла и сразу персистит весь корневой прогон (durable).
 */
export class Memo extends Context.Tag('jobs/Memo')<
    Memo,
    {
        readonly get: <Value>(key: string) => Effect.Effect<Option.Option<Value>>;
        readonly set: <Value>(key: string, value: Value) => Effect.Effect<void>;
    }
>() {}

/** Отчёт о прогрессе текущего узла (наблюдаемость; не состояние для возобновления). */
export class Progress extends Context.Tag('jobs/Progress')<
    Progress,
    {
        readonly report: (progress: JobProgress) => Effect.Effect<void>;
    }
>() {}
