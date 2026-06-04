import { Effect, Option } from 'effect';
import type { JobKey, JobRun } from '@miracle/types';
import type { Job } from './job.js';
import { Jobs, Memo, Progress } from './context.js';
import { hashKey } from './hash-key.js';
import type { JobStore } from './store.js';

/** Ошибка, пробрасываемая наверх, когда дочерний прогон находится в терминальном неуспешном статусе. */
export class JobChildFailedError extends Error {
    constructor(public readonly child: JobRun) {
        super(`Дочерний прогон "${child.id}" (${child.job}) завершился со статусом ${child.status}`);
        this.name = 'JobChildFailedError';
    }
}

const errToMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

/**
 * Реализация {@link Memo}, замкнутая на конкретный узел. `get` читает значение из памяти узла
 * (`node.memo`), `set` мутирует его и сразу персистит патчем в хранилище (durable до след. шага).
 */
function makeMemo(store: JobStore, node: JobRun) {
    return {
        get: <Value>(key: string) =>
            Effect.sync(() => Option.fromNullable(node.memo?.[key] as Value | undefined)),
        set: <Value>(key: string, value: Value) =>
            Effect.promise(async () => {
                node.memo = { ...node.memo, [key]: value };
                await store.patch(node.id, { memo: node.memo });
            }),
    };
}

/**
 * Реализация {@link Progress}, замкнутая на конкретный узел. `set` пишет процент и подпись в
 * `node.progress` и персистит патчем (только наблюдаемость, не состояние для возобновления).
 */
function makeProgress(store: JobStore, node: JobRun) {
    return {
        set: (pct: number, label?: string) =>
            Effect.promise(async () => {
                node.progress = { pct, ...(label !== undefined ? { label } : {}) };
                await store.patch(node.id, { progress: node.progress });
            }),
    };
}

/**
 * Реализация сервиса {@link Jobs}, замкнутая на узел-родитель. `run` находит-или-создаёт прогон
 * по глобальной идентичности `keyHash = hashKey(key)` (`parentId` проставляется в текущий узел,
 * но в идентичности не участвует) и решает его судьбу по статусу:
 * - `succeeded` → возвращаем сохранённый `output` (повторно не исполняем);
 * - `failed`/`cancelled` → пробрасываем ошибку наверх (перезапуск — только явной командой);
 * - `running`/`queued` (новый или артефакт краха) → исполняем в той же строке.
 *
 * `runId` (= `parent.id`) родитель кладёт в ключ ребёнка (`[jobs.runId, 'сегмент']`), чтобы тот
 * был глобально уникален. Рекурсия `makeJobs(store, child)` внутри {@link execute} обеспечивает,
 * что родителем внука становится ребёнок, а не корень.
 */
function makeJobs(store: JobStore, parent: JobRun) {
    return {
        runId: parent.id,
        run: <Input, Output>(job: Job<Input, Output>, key: JobKey, input: Input) =>
            Effect.gen(function* () {
                const node = yield* Effect.promise(() =>
                    store.findOrCreate({ job: job.id, parentId: parent.id, key, keyHash: hashKey(key), input }),
                );
                if (node.status === 'succeeded') {
                    return node.output as Output;
                }
                if (node.status === 'failed' || node.status === 'cancelled') {
                    return yield* Effect.fail(new JobChildFailedError(node));
                }
                return yield* execute(store, job, node);
            }),
    };
}

/**
 * Исполняет тело одного джоба на его строке прогона: переводит в `running`, провайдит сервисы
 * (`Jobs`/`Memo`/`Progress`), замкнутые на этот узел, при успехе пишет `output`+`succeeded`,
 * при ошибке — `failed`+сообщение. Прерывание (отмена волокна) не считается ошибкой и сюда
 * не попадает — статус `cancelled` ставит сервис рантайма.
 */
export function execute<Input, Output>(
    store: JobStore,
    job: Job<Input, Output>,
    node: JobRun,
): Effect.Effect<Output, unknown> {
    const body = Effect.gen(function* () {
        node.status = 'running';
        node.error = undefined;
        yield* Effect.promise(() => store.patch(node.id, { status: 'running', error: undefined }));

        const output = yield* job.run(node.input as Input).pipe(
            Effect.provideService(Jobs, makeJobs(store, node)),
            Effect.provideService(Memo, makeMemo(store, node)),
            Effect.provideService(Progress, makeProgress(store, node)),
        );

        node.status = 'succeeded';
        node.output = output;
        yield* Effect.promise(() => store.patch(node.id, { status: 'succeeded', output }));
        return output;
    });

    return body.pipe(
        Effect.tapError((error) =>
            Effect.promise(() => store.patch(node.id, { status: 'failed', error: errToMessage(error) })),
        ),
    );
}
