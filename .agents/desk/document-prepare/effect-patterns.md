# Effect-паттерны в miracle (для DPS и jobs-with-tools)

Справочник для implementer-субагентов Document Prepare Service. Опирается на существующий код `back-nest`, не на абстрактный Effect из других репозиториев.

---

## Базовый стиль: `Effect.gen`

Тело job и JobTool — генератор Effect:

```ts
Effect.gen(function* () {
  const progress = yield* Progress;
  yield* progress.push(0, { label: 'загрузка данных' });

  const result = yield* someEffect;
  return result;
});
```

Правила:
- `yield*` для всех Effect внутри gen.
- Возвращаемое значение gen — output job/tool.
- Ошибки пробрасываются наверх; runtime job красит `JobRun` в `failed` / `partial`.

Референсы: `back-nest/src/jobs/implementations/order/analyse-designation.job.ts`, `back-nest/src/jobs/framework/runtime.ts` (`execute`).

---

## Обёртка Promise: `Effect.tryPromise` и хелперы

Универсальные хелперы (`back-nest/src/common/effect-errors.ts`):

| Хелпер | Назначение |
|--------|------------|
| `tryLabeledPromise(label, () => promise)` | БД/файлы/Nest-сервисы → `Effect<Value, Error>` |
| `wrapUnknown(label)(error)` | `catch` для `Effect.tryPromise` / `Effect.try` |
| `formatUnknown(error)` | Сообщение для логов и `JobRun.error` |

```ts
const file = yield* tryLabeledPromise(`загрузка файла "${fileId}"`, () => files.get(fileId));

const parsed = yield* Effect.try({
  try: () => Schema.parse(JSON.parse(text)),
  catch: wrapUnknown(`parse response; opId=${opId}`),
});
```

Для transport-слоя с собственными ошибками не стирать typed-ошибки. Например, `YandexService.createResponse` возвращает `Effect<string, YandexError>`; `submitOnceEffect` / `pollUntilDoneEffect` (`back-nest/src/common/cloud-job.ts`) принимают typed Effect и сохраняют семантику ошибок.

Для DPS Vision: `opId` переносить из job-level `Memo` в `ToolMemo` тула `vision.recognize.v1`.

---

## Tagged errors

Паттерн из `YandexService`:

```ts
export class YandexTransportError extends Data.TaggedError('YandexTransportError')<{
  readonly operation: 'create' | 'retrieve';
  readonly cause: unknown;
}> {}
```

Для kreuzberg-адаптера DPS допустим простой typed error:

```ts
export type ExtractError = { readonly _tag: 'ExtractError'; readonly message: string };
```

На границе job можно превратить ошибку в понятное сообщение для `PreparedDocument.error` / `JobRun.error`.

---

## Concurrency: `Effect.all`, `Swarm`, глобальный limiter

`Effect.all(..., { concurrency })` и `Swarm.run(..., { concurrency })` ограничивают параллельность только внутри одного вызова.

`Swarm.run` (`back-nest/src/jobs/framework/swarm.ts`) полезен для batch/enqueue и локальной параллельной обработки:

```ts
const summary = yield* Swarm.run(files, (file) => prepareOne(file.id), {
  label: 'постановка prepare-document',
  failureMode: 'partial',
  concurrency: 4,
});
```

Но Swarm не является глобальным лимитером. Если разные upload/re-prepare запускают независимые `prepare-document`, у каждого будет свой Swarm/Effect scope.

### Рекомендация для kreuzberg: process-local Semaphore

Нужен singleton Nest provider, который оборачивает фактический HTTP POST к kreuzberg:

В `effect@3` семафор — часть модуля `Effect` (`Effect.makeSemaphore`, метод `withPermits` на экземпляре), отдельного `Effect.Semaphore.*` нет.

```ts
@Injectable()
export class KreuzbergConcurrencyLimiter implements OnModuleInit {
  private semaphore!: Effect.Semaphore;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    this.semaphore = Effect.runSync(Effect.makeSemaphore(this.config.dpsMaxConcurrency));
  }

  withPermit = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    this.semaphore.withPermits(1)(effect);
}
```

`withPermits` сам берёт и отпускает permit при любом завершении effect (success/failure/defect/interruption); `acquireUseRelease` не нужен.

Использование:

```ts
extract(file, path) {
  return this.limiter.withPermit(
    Effect.gen(function* () {
      // health-gating, multipart POST /extract
    }),
  );
}
```

Охват: все job executions в одном Nest/PM2-процессе. Для нескольких backend-инстансов позже нужен распределённый limiter (Redis, БД advisory locks, отдельная очередь). LLM Vision лимитируется отдельно через `YandexService`; не смешивать с лимитом kreuzberg.

---

## ToolMemo для durable submit/poll

Старый паттерн cloud jobs хранит `opId` в job-level `Memo`. Новый DPS должен хранить checkpoint в ToolMemo конкретного tool:

```ts
type RecognizeMemo = {
  opId?: string;
  finalPrompt?: { system: string; user: string };
  yandexResponse?: unknown;
  markdown?: string;
};

run(input) {
  return Effect.gen(function* () {
    const memo = yield* ToolMemo.typed<RecognizeMemo>();
    const cached = yield* memo.get((m) => m.markdown);
    if (cached) return cached;

    let opId = yield* memo.get((m) => m.opId);
    if (!opId) {
      opId = yield* yandex.createResponse(...);
      yield* memo.set((m) => m.opId, opId);
      yield* memo.set((m) => m.finalPrompt, { system, user });
    }

    const completed = yield* pollUntilDoneEffect(...);
    yield* memo.set((m) => m.yandexResponse, completed.response);
    yield* memo.set((m) => m.markdown, completed.markdown);
    return completed.markdown;
  });
}
```

---

## Практические правила Nest + Effect

1. Job-класс — `@Injectable()` + `@JobImpl()`, `run` собирается в конструкторе через DI.
2. Императивный слой (`DocumentPrepareService.enqueuePrepare`) — `async/await`; внутри job/tool — Effect.
3. Prisma/Nest service calls внутри job оборачивать в `tryLabeledPromise` / `Effect.tryPromise`.
4. Не вызывать `Effect.runSync` в hot path job; исключение — инициализация process-local limiter.
5. Для отмены prefer Effect-aware операции; длинные Promise должны принимать `AbortSignal`, где возможно.

---

## Чеклист для implementer

- [ ] Тело `prepare-document` — `Effect.gen`.
- [ ] HTTP kreuzberg обёрнут в process-local `KreuzbergConcurrencyLimiter.withPermit`.
- [ ] Vision `opId` / `finalPrompt` / результат — в ToolMemo, не в child JobRun.
- [ ] Не полагаться на Swarm как глобальный лимит.
- [ ] `pnpm lint-fix`, `npx tsc` / релевантные проверки после правок.
