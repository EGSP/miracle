import { Effect, Layer, Option } from 'effect';
import type { JobRun } from '@miracle/types';
import type { AnyJob } from './job.js';
import { Memo, Progress } from './context.js';

/** Сохраняет весь корневой прогон (дерево) на диск. */
export type Persist = (root: JobRun) => Promise<void>;

const errToMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

const persistEff = (root: JobRun, persist: Persist) => Effect.promise(() => persist(root));

function memoLayer(node: JobRun, root: JobRun, persist: Persist) {
    return Layer.succeed(Memo, {
        get: <Value>(key: string) =>
            Effect.sync(() => Option.fromNullable(node.memo?.[key] as Value | undefined)),
        set: <Value>(key: string, value: Value) =>
            Effect.promise(async () => {
                node.memo = { ...node.memo, [key]: value };
                await persist(root);
            }),
    });
}

function progressLayer(node: JobRun, root: JobRun, persist: Persist) {
    return Layer.succeed(Progress, {
        report: (progress) =>
            Effect.promise(async () => {
                node.progress = progress;
                await persist(root);
            }),
    });
}

/**
 * Рекурсивный durable-раннер: обходит описание Job и соответствующий узел JobRun.
 * Составной — идёт по детям (пропуск `succeeded`, возобновление `running`, запуск `queued`);
 * лист — исполняет тело с привязанными к узлу слоями Memo/Progress.
 */
export function runNode(
    job: AnyJob,
    node: JobRun,
    root: JobRun,
    persist: Persist,
): Effect.Effect<unknown, unknown, any> {
    const body = Effect.gen(function* () {
        node.status = 'running';
        delete node.error;
        yield* persistEff(root, persist);

        if (job._tag === 'sequence') {
            // Заранее материализуем записи всех детей (queued) — чтобы дерево JobRun сразу
            // отражало полную структуру (важно для подсчёта прогресса и восстановления).
            node.steps ??= [];
            job.children.forEach((childJob, index) => {
                node.steps![index] ??= {
                    id: `${node.id}.${index}`,
                    job: childJob.id,
                    status: 'queued',
                };
            });

            let input: unknown = node.input;
            for (let index = node.cursor ?? 0; index < job.children.length; index++) {
                const childJob = job.children[index];
                const child = node.steps[index];
                if (child.status === 'succeeded') {
                    input = child.output;
                    node.cursor = index + 1;
                    continue;
                }
                child.input = input;
                input = yield* runNode(childJob, child, root, persist);
                node.cursor = index + 1;
            }
            node.output = input;
        } else {
            node.output = yield* job
                .run(node.input)
                .pipe(
                    Effect.provide(memoLayer(node, root, persist)),
                    Effect.provide(progressLayer(node, root, persist)),
                );
        }

        node.status = 'succeeded';
        yield* persistEff(root, persist);
        return node.output;
    });

    return body.pipe(
        Effect.tapError((error) =>
            Effect.promise(async () => {
                node.status = 'failed';
                node.error = errToMessage(error);
                await persist(root);
            }),
        ),
    );
}
