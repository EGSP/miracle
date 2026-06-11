# Job / JobTool паттерны в miracle (для DPS)

Справочник для implementer Document Prepare Service. Описывает фреймворк `back-nest/src/jobs/framework/` и целевую форму DPS после решений пользователя.

---

## Слои фреймворка

```text
Job (@JobImpl класс)
  └─ run(input) → Effect<Output, unknown, JobEnv>
       ├─ Jobs.run(childJob, key, input)     → новый JobRun (дерево)
       ├─ JobTools.run(tool, input, {key})   → слот в memo.tool_calls (без JobRun)
       ├─ Memo.get/set                       → JobRun.memo (job-level)
       └─ Progress.push                      → JobRun.progress
```

Файлы:
- `job.ts` — `Job`, `defineJob`, `JobEnv`.
- `job-tool.ts` — `JobTool`, `brandJobToolType`.
- `context.ts` — `Jobs`, `JobTools`, `Memo`, `Progress`, `ToolMemo`.
- `runtime.ts` — `execute`, `makeJobTools`, persist `memo.tool_calls`.
- `swarm.ts` — параллельные Effect с политикой ошибок.
- `hash-key.ts` — `hashKey(key)`.

---

## Целевой дизайн DPS: одна job `prepare-document`

Решение пользователя:

| Было во временной Фазе 1 | Должно быть |
|--------------------------|-------------|
| `prepare-document:kreuzberg` и `prepare-document:llm` | Одна `prepare-document` |
| Движок в job id | Движок в `input.engine` |
| Jobs в `document-prepare/jobs/` | Job в `jobs/implementations/document-prepare/` |
| Child jobs `:recognize` / `:apply` | JobTool + ToolMemo |

Input:

```ts
type PrepareDocumentInput = {
  fileId: string;
  preparedDocumentId: string;
  engine: 'kreuzberg' | 'llm-vision';
};
```

Key:

```ts
await jobs.start('prepare-document', input, ['prepare-document', fileId]);
```

Engine не включать в key в MVP: на один `fileId` одна актуальная подготовка, engine выводится из файла при enqueue. Для будущих A/B вариантов добавить `configHash`.

---

## Размещение файлов

```text
back-nest/src/document-prepare/          # домен, без @JobImpl
  document-prepare.module.ts
  document-prepare.service.ts
  document-prepare.controller.ts
  extractor.port.ts
  router.ts
  adapters/
    kreuzberg-http.extractor.ts
    llm-vision.extractor.ts
  kreuzberg-concurrency.limiter.ts

back-nest/src/jobs/implementations/document-prepare/
  prepare-document.job.ts                # @JobImpl root
  tools/
    kreuzberg-extract.tool.ts
    vision-render.tool.ts
    vision-recognize.tool.ts
    prepare-apply.tool.ts
```

`DocumentPrepareModule` экспортирует сервисы/адаптеры/limiter. `JobImplementationsModule` импортирует `DocumentPrepareModule` и регистрирует `PrepareDocumentJob` + tool providers, если tools оформлены как injectable классы.

---

## Тело `prepare-document`

```ts
this.run = (input) =>
  Effect.gen(function* () {
    const tools = yield* JobTools;
    const progress = yield* Progress;
    const jobs = yield* Jobs;

    yield* progress.push(0, { label: 'подготовка документа' });
    yield* tryLabeledPromise('mark running', () =>
      documentPrepare.markRunning(input.preparedDocumentId, jobs.runId),
    );

    if (input.engine === 'kreuzberg') {
      yield* tools.run(kreuzbergExtractTool, { fileId: input.fileId });
    } else {
      yield* tools.run(visionRenderTool, { fileId: input.fileId });
      yield* tools.run(visionRecognizeTool, { fileId: input.fileId });
    }

    yield* tools.run(prepareApplyTool, {
      preparedDocumentId: input.preparedDocumentId,
      fileId: input.fileId,
      engine: input.engine,
    });

    yield* progress.push(1, { label: 'завершено' });
  });
```

Диспетчеризация по `engine` — внутри одной job. Отдельные root job ids для стратегий не создавать.

---

## JobTool / ToolMemo

Tool сохраняет durable state в `JobRun.memo.tool_calls[keyHash]`:

```ts
@Injectable()
export class KreuzbergExtractTool implements JobTool<
  { fileId: string },
  PreparedResult,
  { markdown?: string; meta?: Record<string, unknown> },
  ExtractError
> {
  readonly type = brandJobToolType('kreuzberg.extract.v1');

  run(input) {
    return Effect.gen(function* () {
      const memo = yield* ToolMemo.typed<{ markdown?: string; meta?: Record<string, unknown> }>();
      const cached = yield* memo.get((m) => m.markdown);
      if (cached) {
        const meta = yield* memo.get((m) => m.meta);
        return { markdown: cached, meta };
      }

      const result = yield* extractor.extract(...);
      yield* memo.set((m) => m.markdown, result.markdown);
      yield* memo.set((m) => m.meta, result.meta);
      return result;
    });
  }
}
```

Вызов:

```ts
const tools = yield* JobTools;
yield* tools.run(kreuzbergExtractTool, { fileId });
// если один и тот же tool вызывается несколько раз:
yield* tools.run(visionRecognizePageTool, { page }, { key: ['page', page] });
```

Tool type версионировать: `kreuzberg.extract.v1`, `vision.render.v1`, `vision.recognize.v1`, `prepare.apply.v1`. Новый алгоритм/промпт — новый suffix `v2`.

---

## Чего избегать в DPS

Не копировать legacy pattern `defineJob(':llm')` / `defineJob(':apply')` из `analyse-designation.job.ts`, `extract-positions-from-chunk.job.ts`, `scan.shared.ts`. Там каждый шаг — отдельный `JobRun`; в DPS шаги одного pipeline должны быть tool calls внутри одного `prepare-document`.

Child jobs остаются уместны для междоменной оркестрации (`analyse-order` → `analyse-application`), но не для `extract` / `recognize` / `apply` одного документа.

---

## Swarm и лимиты

Swarm полезен:
- batch enqueue в Фазе 4;
- параллельная обработка страниц внутри одного job, если появится;
- сбор partial failures.

Swarm не решает глобальный лимит kreuzberg. Для этого нужен singleton process-local limiter в HTTP-адаптере.

---

## Миграция текущей Фазы 1

Текущая временная реализация может содержать две stub jobs в `document-prepare/jobs/`. Следующий implementer должен:

1. Удалить/заменить `PrepareDocumentKreuzbergJob`, `PrepareDocumentLlmJob`.
2. Добавить `PrepareDocumentJob` в `back-nest/src/jobs/implementations/document-prepare/prepare-document.job.ts`.
3. Обновить `router.ts`: единый job id `prepare-document`, key `['prepare-document', fileId]`, engine отдельно.
4. Обновить `DocumentPrepareService.enqueuePrepare`: передавать `engine` в input.
5. Зарегистрировать job в `JobImplementationsModule.providers`.
6. Держать domain module без `@JobImpl`.
7. Обновить `dp.report.md`.

---

## Чеклист для implementer

- [ ] Одна `prepare-document`, engine в input.
- [ ] Key: `['prepare-document', fileId]`.
- [ ] Реализация job в `jobs/implementations/document-prepare/`.
- [ ] Шаги — `JobTool`, не child jobs.
- [ ] `tool.type` версионирован.
- [ ] Kreuzberg HTTP за process-local limiter.
- [ ] Документация на русском обновлена.
