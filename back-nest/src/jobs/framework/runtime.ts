import { Effect, Option } from 'effect';
import type { JobRun } from '@miracle/types';
import type { Job } from './job.js';
import { Jobs, Memo, Progress } from './context.js';
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
 * Реализация сервиса {@link Jobs}, замкнутая на узел-родитель. `run` находит-или-создаёт ребёнка
 * по `(parent.id, key)` и решает его судьбу по статусу:
 * - `succeeded` → возвращаем сохранённый `output` (повторно не исполняем);
 * - `failed`/`cancelled` → пробрасываем ошибку наверх (перезапуск — только явной командой);
 * - `running`/`queued` (артефакт краха) → переисполняем в той же строке;
 * - нет строки → создаём и исполняем.
 *
 * Рекурсия `makeJobs(store, child)` внутри {@link execute} обеспечивает, что родителем внука
 * становится ребёнок, а не корень.
 */
function makeJobs(store: JobStore, parent: JobRun) {
    return {
        run: <Input, Output>(job: Job<Input, Output>, key: string, input: Input) =>
            Effect.gen(function* () {
                const existing = yield* Effect.promise(() => store.findChild(parent.id, key));
                if (existing) {
                    if (existing.status === 'succeeded') {
                        return existing.output as Output;
                    }
                    if (existing.status === 'failed' || existing.status === 'cancelled') {
                        return yield* Effect.fail(new JobChildFailedError(existing));
                    }
                    return yield* execute(store, job, existing);
                }
                const child = yield* Effect.promise(() =>
                    store.create({ job: job.id, parentId: parent.id, key, input }),
                );
                return yield* execute(store, job, child);
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
