# Подход к ошибкам в Effect/jobs

## Короткая формула

Нижний уровень должен превращать `unknown` из внешнего мира в нормальную доменную/техническую ошибку. Верхние уровни не должны терять причину: они добавляют контекст через `mapError` и пробрасывают ошибку дальше. Runtime jobs в самом конце сохраняет полную цепочку, а не только верхний `message`.

Иначе получается типичный симптом:

```text
An unknown error occurred in Effect.tryPromise
```

Это не настоящая причина. Это служебный текст Effect, который появляется, когда `Effect.tryPromise` получил reject неизвестной формы и его не нормализовали через `catch`.

## Уровни ответственности

1. Внешняя граница: SDK, HTTP, Prisma, `JSON.parse`, Zod.

   Здесь нужно использовать `Effect.tryPromise({ try, catch })` и превращать любой `unknown` в `Error` с понятным сообщением и `cause`.

2. Инфраструктурный helper: `submitOnce`, `pollUntilDone`, лимитеры, общие cloud helpers.

   Здесь полезно добавить технический контекст: какой этап упал (`submit`, `poll`, `parse`), какой внешний сервис, какой `opId`, если он известен.

3. Конкретная job.

   Здесь добавляется бизнес-контекст: `jobId`, `applicationId`, `chunkKey`, `fileId`, `tcId`, `positionId`, ключ чанка, название этапа pipeline.

4. Job runtime.

   Runtime не должен "улучшать" ошибку бизнес-смыслом. Его задача - сохранить полную диагностическую форму: `name`, `message`, `stack`, `cause`, child run details, а для Effect/FiberFailure - вложенный Effect cause.

5. UI.

   UI показывает короткое сообщение первым экраном и раскрываемые детали ниже. Не стоит заставлять UI восстанавливать смысл из обрезанной строки.

## Практические правила

- `tryPromise(fn)` без `catch` допустим только для кода, где reject точно является хорошим `Error`. Для SDK это почти никогда не гарантировано.
- `mapError` используется, когда текущий уровень может добавить полезный контекст.
- `tapError` используется только для побочных действий: лог, запись статуса, запись диагностики в memo. Он не должен менять смысл ошибки.
- `catchAll` используется, когда ошибка реально обработана: есть fallback, retry, компенсация или перевод в другой тип результата.
- Не надо ловить ошибку на каждом уровне. Ловить стоит там, где появляется новая информация.
- Не надо терять `cause`. Если ошибка оборачивается, исходная ошибка должна уходить в `{ cause: error }`.
- Для дочерних jobs ошибка родителя должна включать `child.error`, иначе настоящий leaf failure теряется за `JobChildFailedError`.

## Минимальный набор helper-ов

```ts
const formatUnknown = (error: unknown): string => {
    if (error instanceof Error) {
        const cause = error.cause ? `; cause: ${formatUnknown(error.cause)}` : '';
        return `${error.name}: ${error.message}${cause}`;
    }

    if (typeof error === 'string') return error;

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

const wrapUnknown =
    (message: string) =>
    (error: unknown): Error =>
        new Error(`${message}: ${formatUnknown(error)}`, { cause: error });
```

## Пример: внешний сервис

```ts
const submitCompletion = (request: LlmRequest) =>
    Effect.tryPromise({
        try: () => yandex.submitCompletion(request),
        catch: wrapUnknown('Yandex submitCompletion failed'),
    });

const pollCompletionJson = <T>(operationId: string, schema: ZodSchema<T>) =>
    Effect.tryPromise({
        try: () => yandex.pollCompletionJson(operationId, schema),
        catch: wrapUnknown(`Yandex pollCompletionJson failed for operation "${operationId}"`),
    });
```

Важная мысль: если `JSON.parse` или Zod падает внутри `pollCompletionJson`, это тоже граница с нестабильным внешним ответом. Такую ошибку лучше явно назвать: `invalid JSON`, `schema validation failed`, `empty response`, `operation failed`.

## Пример: helper submit/poll

Лучше, чтобы общие helper-ы принимали label и добавляли его сами.

```ts
export const submitOnce = (
    submit: () => Promise<string>,
    options?: {
        label?: string;
        extraMemo?: Record<string, unknown>;
    },
): Effect.Effect<string, Error, Memo> =>
    Effect.gen(function* () {
        const memo = yield* Memo;
        const saved = yield* memo.get<string>('opId');
        if (Option.isSome(saved)) {
            return saved.value;
        }

        for (const [key, value] of Object.entries(options?.extraMemo ?? {})) {
            yield* memo.set(key, value);
        }

        const label = options?.label ?? 'submit cloud operation';
        const opId = yield* Effect.tryPromise({
            try: submit,
            catch: wrapUnknown(label),
        });

        yield* memo.set('opId', opId);
        return opId;
    });
```

```ts
export const pollUntilDone = <Output>(
    check: () => Promise<{ done: boolean; result?: Output }>,
    options?: {
        label?: string;
        intervalMs?: number;
    },
): Effect.Effect<Output, Error> =>
    Effect.gen(function* () {
        const intervalMs = options?.intervalMs ?? 3000;
        const label = options?.label ?? 'poll cloud operation';

        while (true) {
            const result = yield* Effect.tryPromise({
                try: check,
                catch: wrapUnknown(label),
            });

            if (result.done) {
                return result.result as Output;
            }

            yield* Effect.sleep(Duration.millis(intervalMs));
        }
    });
```

## Пример: job добавляет бизнес-контекст

```ts
const llm = defineJob(
    'extract-positions-from-chunk:llm',
    (input: ExtractInput): Effect.Effect<OrderPosition[], Error, JobEnv> =>
        Effect.gen(function* () {
            const catalog = yield* Effect.promise(() => productTypes.getAll());
            const system = buildSystemPrompt(catalog);
            const userText = JSON.stringify(input.chunk);

            const opId = yield* submitOnce(
                () =>
                    yandex.submitCompletion({
                        messages: [
                            { role: 'system', text: system },
                            { role: 'user', text: userText },
                        ],
                        temperature: 0.1,
                        maxTokens: LLM_MAX_OUTPUT_TOKENS,
                        jsonSchema: PositionsJsonSchema,
                    }),
                {
                    label: `extract positions submit for chunk "${input.chunkKey ?? 'unknown'}"`,
                    extraMemo: { finalPrompt: { system, user: userText } },
                },
            );

            const out = yield* pollUntilDone(
                () => yandex.pollCompletionJson(opId, PositionsZodSchema),
                {
                    label: `extract positions poll for operation "${opId}"`,
                },
            );

            return out.positions.map((p) => toOrderPosition(p, input.applicationId, catalog));
        }).pipe(
            Effect.mapError(
                (error) =>
                    new Error(
                        `Failed to extract positions from chunk "${input.chunkKey ?? 'unknown'}" for application "${input.applicationId}"`,
                        { cause: error },
                    ),
            ),
        ),
);
```

Ожидаемая цепочка после такого подхода:

```text
Failed to extract positions from chunk "sheet:5:DataMobile:rows:0-14" for application "..."
caused by: extract positions poll for operation "..."
caused by: Yandex pollCompletionJson failed: SyntaxError: Unexpected token ...
```

## Runtime: не обрезать цепочку

Слабое место в job runtime - сохранение только `error.message`. Для Effect/FiberFailure это часто верхний технический текст, а настоящая причина лежит глубже.

Минимальное улучшение - рекурсивно форматировать `cause`:

```ts
const errToMessage = (error: unknown): string => {
    if (error instanceof Error) {
        const cause = error.cause ? `\nCaused by: ${errToMessage(error.cause)}` : '';
        return `${error.name}: ${error.message}${cause}`;
    }

    if (typeof error === 'string') return error;

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};
```

Для Effect лучше дополнительно сохранять pretty cause на уровне `catchAllCause`:

```ts
execute(this.store, job, root).pipe(
    Effect.catchAllCause((cause) =>
        Effect.sync(() => {
            this.logger.error(
                `прогон "${root.id}" (${root.job}) упал`,
                Cause.pretty(cause),
            );
        }),
    ),
);
```

Если в БД когда-нибудь можно поменять форму поля, лучше хранить не строку, а JSON:

```ts
type JobErrorInfo = {
    message: string;
    name?: string;
    stack?: string;
    cause?: JobErrorInfo | string;
    details?: unknown;
};
```

## Child job failures

Когда падает дочерний прогон, родитель сейчас может видеть только факт падения ребёнка. Но для диагностики важна причина ребёнка.

```ts
export class JobChildFailedError extends Error {
    constructor(public readonly child: JobRun) {
        super(
            `Child job "${child.id}" (${child.job}) finished with status ${child.status}` +
                (child.error ? `: ${child.error}` : ''),
        );
        this.name = 'JobChildFailedError';
    }
}
```

Так корневой `analyse-application` или `extract-positions-from-chunk` не будет скрывать настоящую ошибку leaf job.

## Итог

Правильная модель такая:

```text
external boundary:
  unknown -> Error with cause

shared helper:
  adds technical stage context

domain job:
  adds business context

runtime:
  persists full chain

ui:
  shows summary + details
```

Цель - чтобы в карточке job было не `An unknown error occurred in Effect.tryPromise`, а диагностическая цепочка: какой job, какой chunk/application/opId, какой внешний вызов, и какая исходная ошибка SDK/JSON/Zod.
