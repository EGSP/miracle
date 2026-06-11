# Фаза 3 — резюме оркестратора (приёмка LLM Vision)

Дата: 2026-06-11  
Статус: **принято** (`npx tsc` OK, live Yandex не проверялся)

Связанные документы: [dp.report.md](../../plans/dp.report.md), [llm-vision-migration.md](./llm-vision-migration.md), [job-patterns.md](./job-patterns.md).

---

## Что сделано

Реализовано через implementer по справочнику codebase-explorer (`llm-vision-migration.md`):

| Компонент | Роль |
|-----------|------|
| `document-prepare/adapters/llm-vision.extractor.ts` | render PDF/images, submit/poll Yandex, `PreparedResult` |
| `jobs/.../tools/vision-render.tool.ts` | `vision.render.v1`, ToolMemo с кэшем `images` |
| `jobs/.../tools/vision-recognize.tool.ts` | `vision.recognize.v1`, ToolMemo: `opId`, `finalPrompt`, `yandexResponse`, `markdown` |
| `jobs/.../prepare-document.job.ts` | ветка `llm-vision`: render → recognize → apply |
| Документация | README DPS, обновлён `dp.report.md` |

Legacy (`llm-vision.job`, `FileContent`) не тронуты.

---

## Соответствие паттернам

### Соблюдено

- Одна job `prepare-document`, движок в `input.engine`
- Шаги — `JobTool` + `ToolMemo`, без child jobs
- `opId` в ToolMemo recognize-tool, не в job-level `Memo`
- Промпты `LLM_VISION_*` из `scan.shared.ts` (не TC)
- `prepare.apply.v1` переиспользован
- `usedPages` для PDF
- Симметричный `markFailedAndFail` для обеих веток
- Tools в `jobs/implementations/document-prepare/tools/`
- `@JobImpl` только в jobs-слое, не в доменном модуле

### Замечания

1. **Нарушение слоёв** — `llm-vision.extractor.ts` импортирует из `jobs/implementations/scan/scan.shared.ts`. Домен зависит от jobs-слоя. Промпты (и при желании `renderPages`) лучше вынести в `document-prepare/` или `common/`, scan импортировать оттуда.

2. **Дублирование `renderPages`** — логика почти копия `scan.shared.ts:101-124`. Два места правки при изменении scale/usedPages.

3. **Два poll-loop** — `VisionRecognizeTool.pollUntilDone` и приватный `LlmVisionExtractor.pollUntilDone` в `recognize()`. Разная реализация одного и того же.

4. **Лишний API extractor** — `extract()` и `recognize()` не используются tools (только `renderPages` + `submit`/`pollOnce`). Порт `DocumentExtractor` формально закрыт, но путь без ToolMemo дублирует pipeline.

5. **ToolMemo с base64** — `vision.render.v1` кэширует полный массив `{ base64, dataUrl }` в `job_runs.memo`. Для многостраничного PDF может раздуть JSON в БД.

6. **Progress** — в legacy `submitOnceEffect` пушились «отправка» / «ожидание»; в recognize-tool этого нет (у JobTool нет `Progress`). Прогресс только на уровне job.

7. **Хрупкая проверка завершения poll** — `'outputText' in poll` вместо явного `poll.done === true`.

---

## Что упростить (приоритет)

### 1. Вынести общий рендер и промпты — высокий

```
document-prepare/vision/
  prompts.ts          ← LLM_VISION_PROMPT, LLM_VISION_USER
  render-pages.ts     ← renderVisionPages(file, path, convert)
```

`scan.shared.ts` и `LlmVisionExtractor` импортируют оттуда. Убирает дублирование и нарушение слоёв.

### 2. Один poll-хелпер с ToolMemo — средний

Сейчас poll вручную в `VisionRecognizeTool`. Варианты:

- `pollVisionUntilDone(extractor, opId, fileId)` в `document-prepare/` или `common/cloud-job-tool.ts`
- адаптировать `pollUntilDoneEffect` под ToolMemo

Убирает дублирование с `LlmVisionExtractor.pollUntilDone`.

### 3. Общий «загрузи файл или fail» для tools — средний

`KreuzbergExtractTool` и `VisionRenderTool` повторяют: `files.get` → not found → `getFilePath`. Вынести в `document-prepare/tools/load-file.ts` или хелпер `loadFileForPrepare(fileId)`.

### 4. Упростить `prepare-document.job.ts` — низкий–средний

Две почти одинаковые ветки pipeline. Таблица `engine → steps[]` или общий `runPipeline`. Сейчас ~95 строк — читаемо, но при Фазе 4+ разрастётся.

### 5. Пересмотреть кэш images в ToolMemo — продуктовый выбор

- **A (сейчас):** кэшировать images → быстрый resume, тяжёлый memo
- **B:** кэшировать `pageCount` + `fileId`/`updatedAt`, при resume re-render → легче БД, дороже CPU
- **C:** images на диск, в memo — путь

Для MVP A ок; для production PDF 30+ страниц — B или C.

### 6. Убрать неиспользуемые методы extractor — низкий

Оставить: `renderPages`, `submit`, `pollOnce`, `toPreparedResult`, `getFinalPrompt`. Убрать `extract()`, `recognize()`, приватный `pollUntilDone`.

### 7. Единый модуль ошибок DPS — низкий

`extractError` / `yandexToExtractError` в kreuzberg и vision — один `document-prepare/errors.ts`.

---

## Решение оркестратора

**Фаза 3 принята.** Функционально и по паттернам jobs-with-tools всё на месте.

Рекомендация: рефакторинг п.1 (промпты + renderPages) сделать до или параллельно с Фазой 4, чтобы не править два слоя при каждом изменении vision.

---

## Следующий шаг

**Фаза 4** — автоподготовка на upload + backpressure (`Swarm` для batch enqueue) + глобальный kreuzberg limiter.

Открытые риски (из плана):

- Kreuzberg `/extract` response shape — нужна live-валидация
- Все PDF через LLM Vision — cost/latency
- Большие PDF — лимиты модели на количество страниц в одном запросе
- Durable recovery `vision.recognize.v1` после рестарта — не smoke-тестировался
