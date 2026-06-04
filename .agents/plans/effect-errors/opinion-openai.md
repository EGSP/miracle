# Мнение OpenAI по `suggestion-claude.md`

## Короткий вывод

Я в целом согласен с предложением Claude. Оно точнее моего первого наброска в одном важном месте: проблема не только в безликом `Effect.tryPromise`, но и в смешении каналов Effect. Особенно важны два тезиса:

- `Effect.tryPromise(fn)` без `catch` превращает reject в `UnknownException`, из-за чего теряется сообщение внешнего SDK.
- `Effect.promise(fn)` для падающих промисов отправляет reject в defect-канал, а не в обычный failure-канал. Это может обходить `tapError`/`catchAll` и ломать durable-семантику jobs.

То есть Claude правильно расширяет задачу: нужно не просто красиво форматировать ошибки, а договориться, какие ошибки являются ожидаемыми failure, какие являются defect, и что runtime обязан persist'ить.

## Что считаю правильным

### 1. `Effect.promise` должен быть редким

Согласен с правилом:

```text
все реально падающие async-вызовы -> Effect.tryPromise({ try, catch })
Effect.promise -> только для промиса, который по контракту не должен падать
```

Для job-движка это особенно важно. Если `positions.create`, `filesContent.getContent`, `applications.get`, `store.patch` или Yandex SDK reject-ятся, это не "фатальный дефект рантайма", а нормальная операционная ошибка: БД недоступна, запрос невалиден, внешний сервис вернул 4xx/5xx, JSON не распарсился. Такие ошибки должны попадать в E-канал, чтобы job становилась `failed`, а best-effort-ветки могли их изолировать.

### 2. `execute` лучше перевести на `tapErrorCause`

Согласен, что `execute` должен видеть не только failure, но и defect. Durable runtime не должен оставлять job в `running`, если внутри случился неожиданный throw/reject. Лучше пометить run как `failed`, записать диагностическую причину, а interruption оставить отдельной семантикой cancel.

Правильная форма:

```ts
return body.pipe(
    Effect.tapErrorCause((cause) =>
        Cause.isInterruptedOnly(cause)
            ? Effect.void
            : Effect.promise(() =>
                  store.patch(node.id, {
                      status: 'failed',
                      error: errToMessage(Cause.squash(cause)),
                  }),
              ),
    ),
);
```

При этом полный `Cause.pretty(cause)` я бы отправлял в логгер, а в `JobRun.error` писал компактную строку.

### 3. Ошибка дочерней job должна включать `child.error`

Согласен. Сейчас родительский `JobChildFailedError` сообщает только факт падения ребенка. Это полезно для дерева, но плохо для карточки корневого прогона. В сообщение стоит включать `child.error`, иначе настоящая причина останется только на leaf-узле.

### 4. `Cause.pretty` лучше для логов, не для UI

Согласен с осторожностью Claude. `Cause.pretty` может быть большим и шумным. Для UI нужна короткая цепочка:

```text
Job failed: extract positions from chunk ...
Caused by: Yandex pollCompletionJson failed for operation ...
Caused by: SyntaxError: Unexpected token ...
```

А полный pretty cause, стеки и внутренности Effect - в backend logs.

## Где я бы упростил

### 1. Не начинать с большой иерархии `Data.TaggedError`

`Data.TaggedError` - правильный инструмент, если мы реально будем различать ошибки через `catchTag`: например, retry only `LlmPollError`, ignore `NotFound`, stop on `ValidationError`.

Но если задача сейчас - диагностика и durable status, я бы начал проще:

```ts
new Error(`Yandex poll failed: ${formatUnknown(error)}`, { cause: error })
```

А `TaggedError` добавлял бы точечно там, где есть поведение по типу ошибки. Иначе можно быстро получить много классов ошибок без практической пользы.

Компромисс:

- Для `cloud-job.ts` можно ввести `CloudSubmitError` и `CloudPollError`, потому что это общий слой и этапы действительно разные.
- Для всех Prisma/service-вызовов сначала достаточно generic wrapper с label.
- Доменные `TaggedError` вводить позже, когда появятся `catchTag`, retry policy или user-facing classification.

### 2. Не переводить весь код одним большим проходом

Claude предлагает массово пройтись по jobs и заменить `Effect.promise` на `tryPromise`. Направление верное, но я бы делал по слоям:

1. Сначала runtime: `tapErrorCause`, нормальный `errToMessage`, `child.error` в `JobChildFailedError`.
2. Затем самые болезненные общие helper-ы: `submitOnce`, `pollUntilDone`.
3. Затем конкретные jobs, которые участвуют в текущем pipeline заказа.
4. Потом остальной код.

Так меньше риск поменять E-типы во многих местах и получить большой TypeScript refactor.

### 3. `store.patch` внутри error handler тоже может упасть

В предложении это не разобрано, но важно: если `store.patch(... failed ...)` сам reject-ится, мы уже находимся в error path. Тут надо хотя бы логировать failure сохранения статуса. Иначе можно потерять и исходную ошибку, и факт, что статус не записался.

Я бы не усложнял на первом шаге, но оставил это как отдельный риск runtime.

## Что я считаю лучшим итоговым дизайном

### Boundary wrapper

На границе с промисом всегда есть label:

```ts
const tryPromiseLabel = <A>(
    label: string,
    promise: () => Promise<A>,
): Effect.Effect<A, Error> =>
    Effect.tryPromise({
        try: promise,
        catch: (error) => new Error(`${label}: ${formatUnknown(error)}`, { cause: error }),
    });
```

Для `submitOnce`/`pollUntilDone` label должен быть параметром:

```ts
yield* submitOnce(
    () => yandex.submitCompletion(request),
    {
        label: `extract positions submit; chunk=${input.chunkKey ?? 'unknown'}`,
        extraMemo: { finalPrompt },
    },
);

yield* pollUntilDone(
    () => yandex.pollCompletionJson(opId, schema),
    {
        label: `extract positions poll; opId=${opId}`,
    },
);
```

### Job-level context

Конкретная job добавляет бизнес-контекст через `mapError`:

```ts
effect.pipe(
    Effect.mapError(
        (error) =>
            new Error(
                `Failed to extract positions from chunk "${input.chunkKey ?? 'unknown'}" for application "${input.applicationId}"`,
                { cause: error },
            ),
    ),
);
```

### Runtime-level persistence

Runtime ловит `Cause`, различает interruption, сохраняет компактную цепочку в `JobRun.error`, пишет полный `Cause.pretty` в логи.

## Моя рекомендация по внедрению

Я бы принял предложение Claude, но реализовал его в таком порядке:

1. `framework/runtime.ts`
   - `errToMessage` разворачивает `error.cause`;
   - `JobChildFailedError` включает `child.error`;
   - `execute` использует `tapErrorCause` с guard на interruption;
   - `launch` логирует `Cause.pretty(cause)`.

2. `common/cloud-job.ts`
   - `submitOnce` и `pollUntilDone` переходят на `tryPromise({ try, catch })`;
   - добавляются labels;
   - ошибки содержат `cause`.

3. `yandex.service.ts`
   - отдельно назвать ошибки submit, operation error, empty response, JSON parse, Zod parse;
   - для текущего `extract-positions-from-chunk` это даст самую большую пользу.

4. Jobs pipeline заказа
   - заменить падающие `Effect.promise` на labeled `tryPromise`;
   - не пытаться сразу типизировать весь мир.

5. После стабилизации
   - добавить `Data.TaggedError` там, где появится реальная логика по типам ошибок: retry, suppression, best-effort classification, user-facing categories.

## Замечание по файлу Claude

В `suggestion-claude.md` написано, что в `framework/runtime.ts` уже внесены две мелкие правки "на ревью". В текущем файле этого не видно: импорт `Cause` отсутствует, `errToMessage` всё ещё возвращает только `error.message`, а `execute` всё ещё использует `tapError`. Возможно, это было в другом рабочем состоянии или не сохранилось. Я бы не опирался на этот пункт как на факт.

## Итоговое мнение

Предложение Claude я считаю правильным направлением. Главная ценность - оно поднимает вопрос с уровня "покажем нормальный message" до уровня корректной модели отказов Effect:

```text
expected operational failure -> E channel -> failed job + readable error
unexpected defect -> Cause -> failed job + full diagnostics
interruption -> cancelled, not failed
```

Мой единственный существенный нюанс: начинать стоит с минимального надежного ядра, а не с полной иерархии typed errors. Сначала нужно перестать терять причины и зависать в `running`, затем уже вводить доменные теги там, где они управляют поведением.
