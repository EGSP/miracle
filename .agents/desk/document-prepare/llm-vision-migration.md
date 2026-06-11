# LLM Vision → DPS Фаза 3: справочник для implementer

Цель: перенести legacy LLM Vision pipeline (`scan.shared.ts`, `llm-vision.job.ts`) в ветку `engine=llm-vision` job `prepare-document` через JobTools `vision.render.v1`, `vision.recognize.v1`, `prepare.apply.v1` — без child jobs и без записи в `FileContent`.

Референсы: [job-patterns.md](./job-patterns.md), [effect-patterns.md](./effect-patterns.md), [dp.report.md](../../plans/dp.report.md).

---

## 1. Что переиспользовать как есть

### Константы и промпты (`scan.shared.ts`)

| Символ | Назначение |
|--------|------------|
| `LLM_VISION_PROMPT` | System prompt для **общих** документов (pdf/jpg/png) |
| `LLM_VISION_USER` | User message: `'Извлеки содержимое документа.'` |

**Не использовать** `TC_VISION_PROMPT` / `TC_VISION_USER` — они для legacy `llm-vision-tc` (ТУ), не для DPS `engine=llm-vision`.

Импорт:

```ts
import { LLM_VISION_PROMPT, LLM_VISION_USER } from '../../scan/scan.shared.js';
```

### Сервисы (глобальные Nest-модули)

| Сервис | Модуль | Методы / константы |
|--------|--------|-------------------|
| `FilesService` | `FilesModule` | `get`, `getFilePath` |
| `ConvertService` | `ConvertModule` (`@Global`) | `pdfToImages(buffer, options)` |
| `YandexService` | `YandexModule` (`@Global`) | `createResponse`, `retrieveResponse` |
| | | `YANDEX_MODELS.vision`, `YandexInput` |

Параметры vision-вызова из legacy `visionRecognize` (`scan.shared.ts:139-155`):

```ts
yandex.createResponse({
  model: YANDEX_MODELS.vision,           // 'qwen3.6-35b-a3b/latest'
  instructions: LLM_VISION_PROMPT,
  input: [
    YandexInput.user([
      ...images.map((page) => YandexInput.imageDataUrl(page.dataUrl)),
      YandexInput.text(LLM_VISION_USER),
    ]),
  ],
  maxOutputTokens: 40000,
})
```

### Типы

| Тип | Файл |
|-----|------|
| `PdfPageImage` | `convert/convert.service.ts` — `{ page, base64, dataUrl }` |
| `PreparedResult`, `ExtractError` | `document-prepare/extractor.port.ts` |
| `validatePageRanges` | `@miracle/types` — парсинг `file.settings.usedPages` |

### Effect-хелперы

| Хелпер | Файл | Где |
|--------|------|-----|
| `tryLabeledPromise` | `common/effect-errors.ts` | чтение файла, `pdfToImages` |
| `formatUnknown` | `common/effect-errors.ts` | сообщения ошибок |
| `pollUntilDoneEffect` | `common/cloud-job.ts` | опрос Yandex (без изменений) |

### Логика рендера страниц

Функция `renderPages` в `scan.shared.ts:101-124` — эталон для `vision.render.v1`:

- **PDF**: `fs.readFile` → `validatePageRanges(usedPages)` → `convert.pdfToImages(buffer, { scale: 2.5, pageNumbers })`
- **png/jpg**: один элемент `[{ page: 1, base64, dataUrl }]`, mime `image/png` или `image/jpeg`
- OCR **не нужен** — все visual-форматы идут в LLM Vision

`scale: 2.5` в legacy (не дефолт `2.0` из `ConvertService`) — сохранить для паритета с `llm-vision` job.

### Существующие DPS-артефакты Фазы 2

| Файл | Роль |
|------|------|
| `prepare-document.job.ts` | Корневая job; заменить stub-ветку `llm-vision` |
| `tools/prepare-apply.tool.ts` | `prepare.apply.v1` — уже готов, принимает `PreparedResult` |
| `tools/kreuzberg-extract.tool.ts` | Образец ToolMemo + idempotent cache |
| `document-prepare.service.ts` | `markRunning` / `markSucceeded` / `markFailed` |
| `router.ts` | `routePreparedEngine` → `'llm-vision'` для `FileDomain.VISUAL` |

### Регистрация (образец)

`job-implementations.module.ts` уже регистрирует `PrepareDocumentJob`, `KreuzbergExtractTool`, `PrepareApplyTool`. Добавить два новых provider-класса tool.

`YandexModule` и `ConvertModule` — `@Global` в `app.module.ts`; отдельный import в `DocumentPrepareModule` **не обязателен** для tools (DI резолвит из корня приложения).

---

## 2. Что НЕ копировать

| Legacy-паттерн | Где | Почему не для DPS |
|----------------|-----|-------------------|
| Child jobs `:recognize` / `:apply` | `buildRecognizeJob`, `buildApplyJob`, `buildScanRun` | DPS — один `JobRun`, шаги через `JobTools.run` |
| `jobs.run(recognizeJob, …)` | `llm-vision.job.ts`, `extract-visual.job.ts` | Заменить на `tools.run(visionRenderTool)` + `tools.run(visionRecognizeTool)` |
| Запись в `FileContent` | `buildApplyJob`, `buildRecognizeJob` (FAILED/COMPLETED) | DPS пишет в `PreparedDocument` через `prepare.apply.v1` |
| `submitOnceEffect` + job-level `Memo` | `cloud-job.ts`, `visionRecognize` | `opId` / `finalPrompt` / `yandexResponse` — в **ToolMemo** тула `vision.recognize.v1` |
| `Memo.set('yandexResponse', …)` в recognize | `scan.shared.ts:163-164` | Перенести в ToolMemo recognize-tool |
| `TC_VISION_*` промпты | `llm-vision-tc.job.ts` | Только для legacy ТУ; DPS — `LLM_VISION_*` |
| OCR / `ocr.job.ts` | scan | Visual → LLM Vision, OCR не используется |
| Удаление legacy jobs | `llm-vision`, `llm-vision-tc`, `extract-visual` | **Пока оставить** — они пишут в `FileContent` для старых читателей |

### Ограничение JobTool и Progress

`JobTool.run` типизирован как `Effect<Output, Error, ToolMemo>` — **без `Progress`** (`job-tool.ts:57-59`).

Legacy `visionRecognize` пушит progress внутри recognize (`'чтение файла'`, `'рендер страниц'`, labels из `submitOnceEffect`). В DPS:

- coarse progress — в `prepare-document.job.ts` (как в ветке kreuzberg);
- fine-grained labels submit/poll — либо inline в recognize-tool **без** `Progress` (только лог), либо новый хелпер `submitOnceToolMemo` + доработка job для `{ determined: false }` pushes **до/после** `tools.run(recognize)`.

Рекомендация MVP: progress в job, не внутри tools.

---

## 3. Декомпозиция: `vision.render.v1` vs `vision.recognize.v1`

### Поток данных

```text
prepare-document (engine=llm-vision)
  │
  ├─ vision.render.v1 { fileId }
  │     ToolMemo: { images?, pageCount?, usedPagesSpec? }
  │     Output:   { images: PdfPageImage[] }
  │
  ├─ vision.recognize.v1 { fileId, images }
  │     ToolMemo: { opId?, finalPrompt?, yandexResponse?, markdown? }
  │     Output:   PreparedResult { markdown, meta? }
  │
  └─ prepare.apply.v1 { preparedDocumentId, result }
        ToolMemo: { applied? }
```

Между tools job передаёт **output → input** (как kreuzberg → apply):

```ts
const { images } = yield* tools.run(visionRenderTool, { fileId: input.fileId });
const result = yield* tools.run(visionRecognizeTool, { fileId: input.fileId, images });
yield* tools.run(prepareApplyTool, { preparedDocumentId: input.preparedDocumentId, result });
```

### `vision.render.v1`

**Input:** `{ fileId: string }`

**ToolMemo (`VisionRenderMemo`):**

| Поле | Когда пишется | Зачем |
|------|---------------|-------|
| `images` | после успешного рендера | idempotent skip при resume |
| `pageCount` | опционально | диагностика / meta |
| `usedPagesSpec` | опционально | фиксация применённого spec |

**Output:** `{ images: PdfPageImage[] }`

**Логика:** порт `renderPages` из `scan.shared.ts` (можно экспортировать функцию или продублировать минимально в tool).

**Не хранить в memo:** `opId`, промпты Yandex — это зона recognize-tool.

### `vision.recognize.v1`

**Input:** `{ fileId: string; images: ReadonlyArray<PdfPageImage> }`

`images` нужны только для **первичного submit**; при resume с сохранённым `opId` повторный submit не выполняется (images не отправляются повторно).

**ToolMemo (`VisionRecognizeMemo`):**

| Поле | Когда пишется | Зачем |
|------|---------------|-------|
| `finalPrompt` | **до** `createResponse` | `{ system: LLM_VISION_PROMPT, user: LLM_VISION_USER }` — аудит, как `extraMemo` в legacy |
| `opId` | сразу **после** `createResponse`, **до** poll | durable checkpoint (аналог `memo.set('opId')` в `submitOnceEffect`) |
| `yandexResponse` | после успешного poll | диагностика (`usage`, полный `Response`) |
| `markdown` | после успешного poll | idempotent return |

**Output:** `PreparedResult`:

```ts
{
  markdown: completed.outputText,
  meta: {
    model: YANDEX_MODELS.vision,
    pageCount: images.length,
    yandexResponseId: opId,
    // опционально: usage из completed.response.usage
  },
}
```

**Не создавать** `pages: PreparedPage[]` per-page — legacy возвращает один текст на весь документ (`[{ text: completed.outputText }]`). Поле `pages` в `PreparedResult` опционально, для vision MVP достаточно `markdown`.

### Ключи tool calls

Оба tool — default key `[]` (один вызов на job). Per-page keys не нужны (один batch vision-запрос на все страницы, как в legacy).

---

## 4. Псевдокод submit/poll с ToolMemo

Замена `submitOnceEffect` (job-level `Memo.get('opId')`) на inline ToolMemo в `vision.recognize.v1`:

```ts
// vision.recognize.v1 — упрощённый псевдокод
run(input) {
  return Effect.gen(function* () {
    const memo = yield* ToolMemo.typed<VisionRecognizeMemo>();

    // 1. Idempotent result
    const cachedMarkdown = yield* memo.get((m) => m.markdown);
    if (cachedMarkdown) {
      const meta = yield* memo.get((m) => m.meta);
      return { markdown: cachedMarkdown, meta };
    }

    const system = LLM_VISION_PROMPT;
    const user = LLM_VISION_USER;

    // 2. Idempotent submit (durable opId)
    let opId = yield* memo.get((m) => m.opId);
    if (!opId) {
      yield* memo.set((m) => m.finalPrompt, { system, user });

      opId = yield* yandex.createResponse({
        model: YANDEX_MODELS.vision,
        instructions: system,
        input: [
          YandexInput.user([
            ...input.images.map((p) => YandexInput.imageDataUrl(p.dataUrl)),
            YandexInput.text(user),
          ]),
        ],
        maxOutputTokens: 40000,
      }).pipe(
        Effect.mapError((e): ExtractError => ({
          _tag: 'ExtractError',
          message: formatYandexError(e, input.fileId),
        })),
      );

      yield* memo.set((m) => m.opId, opId); // durable ДО poll
    }

    // 3. Poll (pollUntilDoneEffect — без Memo)
    const completed = yield* pollUntilDoneEffect(
      yandex.retrieveResponse(opId).pipe(
        Effect.map((poll) => (poll.done ? { done: true, result: poll } : { done: false })),
      ),
      { label: `vision poll; opId=${opId}; file=${input.fileId}` },
    ).pipe(
      Effect.mapError((e): ExtractError => ({
        _tag: 'ExtractError',
        message: formatYandexError(e, input.fileId),
      })),
    );

    yield* memo.set((m) => m.yandexResponse, completed.response);

    const result: PreparedResult = {
      markdown: completed.outputText,
      meta: {
        model: YANDEX_MODELS.vision,
        pageCount: input.images.length,
        yandexResponseId: opId,
      },
    };

    yield* memo.set((m) => m.markdown, result.markdown);
    yield* memo.set((m) => m.meta, result.meta);
    return result;
  });
}
```

**Отличия от `submitOnceEffect`:**

| `submitOnceEffect` | ToolMemo-вариант |
|--------------------|------------------|
| `memo.get<string>('opId')` → `Option` | `memo.get((m) => m.opId)` → `string \| undefined` |
| `extraMemo` batch write | `memo.set((m) => m.finalPrompt, …)` явно |
| `Progress` labels submit/poll | в job или без fine-grained progress |
| Requirements: `Memo \| Progress` | Requirements: `ToolMemo` (+ Yandex через DI) |

Опционально позже: вынести `submitOnceToolMemo` в `common/cloud-job.ts` рядом с `submitOnceEffect` — **не блокер Фазы 3**.

---

## 5. `usedPages`, ошибки, progress labels

### `usedPages`

- Источник: `file.settings?.usedPages` (строка `"1-3, 5"`).
- Валидация: `validatePageRanges(spec)` из `@miracle/types` — при `!ok` fail с `ExtractError` / `Error` с текстом `Настройка usedPages: ${result.message}` (как `scan.shared.ts:112`).
- Применение: только для PDF в `vision.render.v1`; png/jpg — всегда page 1.
- `totalPages` в validate **не передаётся** в legacy — синтаксис проверяется до рендера; out-of-range страницы просто дадут меньше images.

### Обработка ошибок

**В tools:** возвращать `ExtractError` (`{ _tag: 'ExtractError', message }`):

| Источник | Маппинг |
|----------|---------|
| `YandexConfigError` | «Yandex Cloud не сконfigурирован…» |
| `YandexTransportError` | `formatUnknown(cause)` с контекстом fileId |
| `YandexResponseError` | `error.message` из сервиса |
| Файл не найден | `Файл "${fileId}" не найден` |
| Невалидный usedPages | `Настройка usedPages: …` |
| Неподдерживаемое расширение | маловероятно (router отсеивает), но стоит guard |

**В job** (`prepare-document.job.ts`): скопировать паттерн kreuzberg — `markFailedAndFail` + `formatJobError` для `ExtractError`.

Legacy `buildRecognizeJob` при ошибке пишет `FileContent` FAILED — **не делать** в DPS.

### Progress labels (рекомендуемая шкала в job)

| Percent | Label | Когда |
|---------|-------|-------|
| 0 | `подготовка документа` | старт (уже есть) |
| 0.1 | `рендер страниц` | перед `vision.render.v1` |
| 0.3 | `отправка на распознавание` | перед `vision.recognize.v1` |
| 0.8 | `сохранение результата` | перед `prepare.apply.v1` |
| 1 | `завершено` | конец (уже есть) |

Legacy labels `'чтение файла'`, `'ожидание распознавания'` — опционально; без `Progress` в tool poll идёт «тихо» между 0.3 и 0.8.

---

## 6. Регистрация в Nest modules

### Новые файлы (implementer)

```text
back-nest/src/jobs/implementations/document-prepare/tools/
  vision-render.tool.ts      # vision.render.v1
  vision-recognize.tool.ts   # vision.recognize.v1
```

### `job-implementations.module.ts`

```ts
import { VisionRenderTool } from './implementations/document-prepare/tools/vision-render.tool.js';
import { VisionRecognizeTool } from './implementations/document-prepare/tools/vision-recognize.tool.js';

providers: [
  // ...existing...
  VisionRenderTool,
  VisionRecognizeTool,
],
```

### `prepare-document.job.ts`

Инжектить `VisionRenderTool`, `VisionRecognizeTool` в constructor; заменить stub-ветку на pipeline (см. §3).

### `document-prepare.module.ts`

**Не обязательно** менять для Фазы 3: kreuzberg-adapter в domain module, vision-логика в job tools + глобальные `YandexService`/`ConvertService`.

`LlmVisionExtractor` (`adapters/llm-vision.extractor.ts`) — stub; job **не использует** `DocumentExtractor` port (как и kreuzberg через tool напрямую). Обновление extractor — опционально / Фаза 5.

### `document-prepare/README.md`

Обновить после реализации: таблица JobTools, убрать stub из «Не реализовано».

---

## 7. Риски и открытые вопросы

| # | Риск / вопрос | Комментарий |
|---|---------------|-------------|
| 1 | **Размер ToolMemo с `images[]`** | base64 всех страниц в `JobRun.memo.tool_calls` может раздуть JSON в БД. Альтернатива: memo только `{ rendered: true }`, re-render на каждый resume (CPU локально, без повторного cloud submit если `opId` уже в recognize memo). **Рекомендация MVP:** кэшировать `images` в render memo (паритет с kreuzberg markdown cache); мониторить размер memo. |
| 2 | **Progress во время poll** | JobTool без `Progress`; длинный poll не обновляет UI. Приемлемо для MVP или нужен framework change? |
| 3 | **Экспорт `renderPages`** | Сейчас private в `scan.shared.ts`. Экспортировать vs дублировать 20 строк в tool — предпочтительно **экспорт** для single source of truth. |
| 4 | **Нет `submitOnceToolMemo` helper** | Первый JobTool с cloud submit; дублирование ~15 строк idempotent submit. OK для MVP. |
| 5 | **Паритет scale 2.5 vs 2.0** | Legacy vision — 2.5; дефолт ConvertService — 2.0. Явно передавать `{ scale: 2.5 }`. |
| 6 | **Legacy jobs coexistence** | `llm-vision` / `extract-visual` остаются; два pipeline на один файл теоретически возможны (FileContent vs PreparedDocument). Фаза 5 переключит читателей. |
| 7 | **`meta.yandexResponse` в PreparedDocument** | Полный `Response` JSON тяжёлый; в `PreparedResult.meta` класть лёгкие поля (`yandexResponseId`, `pageCount`, `usage`). Полный response — только в ToolMemo recognize. |
| 8 | **Re-prepare после succeed** | `enqueuePrepare` сбрасывает markdown и перезапускает job; tool memos привязаны к **новому** JobRun — checkpoint не мешает. |
| 9 | **Rate limits Yandex** | `YandexService` уже лимитирует submit/poll; доп. limiter для vision не нужен (в отличие от kreuzberg Semaphore). |

---

## Карта файлов-референсов

| Путь | Зачем смотреть |
|------|----------------|
| `jobs/implementations/scan/scan.shared.ts` | промпты, `renderPages`, `visionRecognize` |
| `jobs/implementations/scan/llm-vision.job.ts` | минимальный wiring legacy |
| `jobs/implementations/order/extract-visual.job.ts` | тот же pipeline + кэш FileContent (не копировать apply) |
| `common/cloud-job.ts` | `submitOnceEffect` / `pollUntilDoneEffect` — что заменяем |
| `yandex/yandex.service.ts` | API контракт, ошибки, rate limit |
| `convert/convert.service.ts` | `PdfPageImage`, `pdfToImages` |
| `jobs/implementations/document-prepare/prepare-document.job.ts` | куда встроить ветку |
| `jobs/implementations/document-prepare/tools/kreuzberg-extract.tool.ts` | образец ToolMemo |
| `jobs/implementations/document-prepare/tools/prepare-apply.tool.ts` | финальный apply |
| `document-prepare/router.ts` | `engine=llm-vision` для VISUAL |
