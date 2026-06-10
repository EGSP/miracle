import { Cause, Effect, Option, SynchronizedRef } from 'effect';
import {
    pushJobProgressState,
    latestJobProgressState,
    type JobKey,
    type JobProgressPushOptions,
    type JobRun,
    type JobRunTools,
    type JobStatus,
    type JobToolKey,
    type JobToolType,
    type ToolCall,
} from '@miracle/types';
import { formatUnknown } from '../../common/effect-errors.js';
import type { Job } from './job.js';
import { Jobs, JobTools, Memo, Progress, ToolMemo } from './context.js';
import { hashKey } from './hash-key.js';
import type { JobTool } from './job-tool.js';
import type { JobStore } from './store.js';

/** Ошибка, пробрасываемая наверх, когда дочерний прогон находится в терминальном неуспешном статусе. */
export class JobChildFailedError extends Error {
    constructor(public readonly child: JobRun) {
        const childError = child.error ? `: ${child.error}` : '';
        super(`Дочерний прогон "${child.id}" (${child.job}) завершился со статусом ${child.status}${childError}`);
        this.name = 'JobChildFailedError';
    }
}

/**
 * Сигнал «частичный успех веера»: тело-оркестратор бросает его, когда часть дочерних прогонов
 * упала, а часть прошла. {@link execute} распознаёт его и пишет узлу статус `partial` (а не
 * `failed`); при этом ошибка всё равно всплывает наверх — для родителя `partial` равнозначен
 * провалу (его исход считается неуспешным при сведении). См. {@link JobStatus} и `fanout.ts`.
 */
export class JobPartialError extends Error {
    constructor(
        public readonly failures: ReadonlyArray<unknown>,
        message: string,
    ) {
        super(message);
        this.name = 'JobPartialError';
    }
}

const errToMessage = (error: unknown): string => formatUnknown(error);

type MemoRecord = Record<string, unknown>;
type MemoRef = SynchronizedRef.SynchronizedRef<MemoRecord>;

const toolCallsMemoKey = 'tool_calls';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const toolCallKeyHash = (type: JobToolType, key: JobToolKey): string => hashKey([type, ...key]);

function getJobRunTools(memo: MemoRecord): JobRunTools {
    const tools = memo[toolCallsMemoKey];
    return isRecord(tools) ? (tools as JobRunTools) : {};
}

function persistMemo(store: JobStore, node: JobRun, memo: MemoRecord): Effect.Effect<void> {
    return Effect.promise(async () => {
        node.memo = memo;
        await store.patch(node.id, { memo });
    });
}

/**
 * Реализация {@link Memo}, замкнутая на конкретный узел. `get` читает значение из памяти узла
 * через fiber-safe ref, `set` сериализует read-modify-write и сразу персистит патчем в хранилище
 * (durable до след. шага). Это защищает параллельные `Memo.set` / `ToolMemo.set` от lost update.
 */
function makeMemo(store: JobStore, node: JobRun, memoRef: MemoRef) {
    return {
        get: <Value>(key: string) =>
            Effect.map(SynchronizedRef.get(memoRef), (memo) => Option.fromNullable(memo[key] as Value | undefined)),
        set: <Value>(key: string, value: Value) =>
            SynchronizedRef.modifyEffect(memoRef, (memo) => {
                const next = { ...memo, [key]: value };
                return Effect.as(persistMemo(store, node, next), [undefined, next] as const);
            }),
    };
}

type EnsureToolCallResult<MemoModel extends ToolMemo.Model> = {
    readonly memo: MemoRecord;
    readonly toolMemo: MemoModel;
    readonly changed: boolean;
};

function ensureToolCall<MemoModel extends ToolMemo.Model>(
    memo: MemoRecord,
    type: JobToolType,
    key: JobToolKey,
    keyHash: string,
): EnsureToolCallResult<MemoModel> {
    const tools = getJobRunTools(memo);
    const existing = tools[keyHash] as ToolCall<MemoModel> | undefined;
    const existingMemo = existing?.memo;
    const toolMemo = isRecord(existingMemo) ? (existingMemo as MemoModel) : ({} as MemoModel);

    if (existing !== undefined && isRecord(existingMemo)) {
        return { memo, toolMemo, changed: false };
    }

    const nextTools: JobRunTools = {
        ...tools,
        [keyHash]: { type, key, memo: toolMemo },
    };
    return {
        memo: { ...memo, [toolCallsMemoKey]: nextTools },
        toolMemo,
        changed: true,
    };
}

function selectToolMemoField<MemoModel extends ToolMemo.Model, Value>(
    selector: (memo: MemoModel) => Value,
): string {
    let selected: string | undefined;
    const proxy = new Proxy(
        {},
        {
            get: (_target, property) => {
                if (typeof property !== 'string') {
                    throw new Error('ToolMemo.set поддерживает только string-поля верхнего уровня');
                }
                if (selected !== undefined && selected !== property) {
                    throw new Error('ToolMemo.set поддерживает только один top-level selector вида (m) => m.field');
                }
                selected = property;
                return undefined;
            },
        },
    ) as MemoModel;

    selector(proxy);
    if (selected === undefined) {
        throw new Error('ToolMemo.set требует selector вида (m) => m.field');
    }
    return selected;
}

function withToolCall<MemoModel extends ToolMemo.Model, Value>(
    store: JobStore,
    node: JobRun,
    memoRef: MemoRef,
    type: JobToolType,
    key: JobToolKey,
    keyHash: string,
    f: (toolMemo: MemoModel) => readonly [Value, MemoModel],
): Effect.Effect<Value> {
    return SynchronizedRef.modifyEffect(memoRef, (memo) => {
        const ensured = ensureToolCall<MemoModel>(memo, type, key, keyHash);
        const [value, nextToolMemo] = f(ensured.toolMemo);
        const tools = getJobRunTools(ensured.memo);
        const nextTools: JobRunTools = {
            ...tools,
            [keyHash]: { type, key, memo: nextToolMemo },
        };
        const nextMemo = { ...ensured.memo, [toolCallsMemoKey]: nextTools };
        return Effect.as(persistMemo(store, node, nextMemo), [value, nextMemo] as const);
    });
}

/**
 * Создаёт scoped {@link ToolMemo} для одного вызова JobTool.
 *
 * Слот хранится в `JobRun.memo.tool_calls[keyHash]`, где `keyHash = hashKey([tool.type, ...key])`.
 * Чтение впервые создаёт пустое тело `memo`, поэтому в теле тула не нужны проверки `memo?.xxx` —
 * поля самой модели должны быть опциональными.
 */
function makeToolMemo<MemoModel extends ToolMemo.Model>(
    store: JobStore,
    node: JobRun,
    memoRef: MemoRef,
    type: JobToolType,
    key: JobToolKey,
    keyHash: string,
): ToolMemo.Service<MemoModel> {
    const get = (<Value>(selector?: (memo: MemoModel) => Value) =>
        SynchronizedRef.modifyEffect(memoRef, (memo) => {
            const ensured = ensureToolCall<MemoModel>(memo, type, key, keyHash);
            const value = selector ? selector(ensured.toolMemo) : ensured.toolMemo;
            if (!ensured.changed) {
                return Effect.succeed([value, memo] as const);
            }
            return Effect.as(persistMemo(store, node, ensured.memo), [value, ensured.memo] as const);
        })) as ToolMemo.Service<MemoModel>['get'];

    const set = ((memoOrSelector: MemoModel | ((memo: MemoModel) => unknown), value?: unknown) => {
        if (typeof memoOrSelector !== 'function') {
            return withToolCall(store, node, memoRef, type, key, keyHash, () => [undefined, memoOrSelector] as const);
        }

        const field = selectToolMemoField(memoOrSelector);
        return withToolCall(store, node, memoRef, type, key, keyHash, (current) => [
            undefined,
            { ...current, [field]: value } as MemoModel,
        ]);
    }) as ToolMemo.Service<MemoModel>['set'];

    return { get, set };
}

function makeJobTools(store: JobStore, node: JobRun, memoRef: MemoRef) {
    return {
        run: <Input, Output, MemoModel extends ToolMemo.Model, Error>(
            tool: JobTool<Input, Output, MemoModel, Error>,
            input: Input,
            options?: { readonly key?: JobToolKey },
        ) => {
            const key = options?.key ?? [];
            const keyHash = toolCallKeyHash(tool.type, key);
            return tool
                .run(input)
                .pipe(Effect.provideService(ToolMemo, makeToolMemo(store, node, memoRef, tool.type, key, keyHash)));
        },
    };
}

/**
 * Реализация {@link Progress}, замкнутая на конкретный узел. `push` дополняет или обновляет
 * {@link JobProgress.states} и персистит патчем (только наблюдаемость, не состояние для возобновления).
 */
function makeProgress(store: JobStore, node: JobRun) {
    return {
        push: (percentOrOptions: number | JobProgressPushOptions, options?: JobProgressPushOptions) =>
            Effect.promise(async () => {
                node.progress = pushJobProgressState(node.progress, percentOrOptions, options);
                await store.patch(node.id, { progress: node.progress });
            }),
    };
}

/**
 * Реализация сервиса {@link Jobs}, замкнутая на узел-родитель. `run` находит-или-создаёт прогон
 * по глобальной идентичности `keyHash = hashKey(key)` (`parentId` проставляется в текущий узел,
 * но в идентичности не участвует) и решает его судьбу по статусу:
 * - `succeed` → возвращаем сохранённый `output` (повторно не исполняем);
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
                if (node.status === 'succeed') {
                    return node.output as Output;
                }
                // `partial` для родителя равнозначен провалу: переисполняется только явной командой.
                if (node.status === 'failed' || node.status === 'cancelled' || node.status === 'partial') {
                    return yield* Effect.fail(new JobChildFailedError(node));
                }
                return yield* execute(store, job, node);
            }),
    };
}

/**
 * Исполняет тело одного джоба на его строке прогона: переводит в `running`, провайдит сервисы
 * (`Jobs`/`JobTools`/`Memo`/`Progress`), замкнутые на этот узел, при успехе пишет `output`+`succeed`,
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

        const memoRef = yield* SynchronizedRef.make<MemoRecord>(node.memo ?? {});
        const progressSvc = makeProgress(store, node);

        const output = yield* job.run(node.input as Input).pipe(
            Effect.provideService(Jobs, makeJobs(store, node)),
            Effect.provideService(JobTools, makeJobTools(store, node, memoRef)),
            Effect.provideService(Memo, makeMemo(store, node, memoRef)),
            Effect.provideService(Progress, progressSvc),
        );

        if (latestJobProgressState(node.progress)?.percentNormalized !== 1) {
            yield* progressSvc.push(1, { label: 'завершено' });
        }

        node.status = 'succeed';
        node.output = output;
        yield* Effect.promise(() => store.patch(node.id, { status: 'succeed', output }));
        return output;
    });

    return body.pipe(
        Effect.tapErrorCause((cause) => {
            // Прерывание (отмена волокна) — не ошибка: статус `cancelled` ставит сервис рантайма.
            if (Cause.isInterruptedOnly(cause)) return Effect.void;
            const error = Cause.squash(cause);
            // Частичный успех веера красим в `partial`; всё остальное — `failed`.
            const status: JobStatus = error instanceof JobPartialError ? 'partial' : 'failed';
            return Effect.promise(() => store.patch(node.id, { status, error: errToMessage(error) }));
        }),
    );
}
