# DPS — итоги внедрения

Один файл: что изменилось, как работать сейчас, технический долг и когнитивная нагрузка.  
Дата: 2026-06-12. Детали по фазам — `phase-*.md`, план — `.agents/plans/dp-agents.plan.md`, журнал — `dp.report.md`.

**Расширенная HTML-версия (лекция):** [`.agents/lectures/document-prepare/dps-itogi-vnedreniya/index.html`](../../lectures/document-prepare/dps-itogi-vnedreniya/index.html)

---

## 1. Что было → что стало

| Было | Стало |
|------|--------|
| Синхронное извлечение в HTTP (`POST /files-content/:fileId/extract`): mammoth, xlsx, papaparse | **DPS**: асинхронная job `prepare-document` → единый **markdown** в `PreparedDocument` |
| Разный выход: plain text, CSV-в-тексте, постраничный `FileContent` | Унифицированный `PreparedDocument.markdown` (+ опционально `pages`, `meta`) |
| Vision через child jobs (`extract-visual`, scan `llm-vision`) → `FileContent` | Vision через tools `vision.render.v1` + `vision.recognize.v1` → `PreparedDocument` |
| Non-vision inline в ридере заявок (mammoth/XLSX) | `ApplicationChunkReader` читает только `PreparedDocument` (Effect API) |
| Потребители сами запускали извлечение | **Только DPS** ставит prepare (хук `FilesService.onFileSaved`); анализ не запускает обработку |
| `FileContent` без relation к `File` | `PreparedDocument` с relation, статусы `queued/running/succeeded/failed` |

**Фазы (кратко):**

1. **Инфра** — модуль, Prisma, kreuzberg в docker, stub → одна job `prepare-document`.
2. **Kreuzberg** — `engine=kreuzberg`, tool `kreuzberg.extract.v1`, process-local limiter.
3. **LLM Vision** — `engine=llm-vision`, tools render/recognize, промпты в `document-prepare/vision/`.
4. **Автоподготовка** — `DocumentPrepareUploadListener` на `onFileSaved` (не `FilesService` → DPS напрямую).
5. **Readers** — `ApplicationChunkReader` на `PreparedDocument`; `analyse-application` без `extract-visual`.
6. **Deprecation** — extract endpoint → **410 Gone**; sync extraction код удалён в фазе 7.
7. **Audit** — удалены `mammoth`, `papaparse`, `xlsx` из `back-nest`; `exceljs` оставлен (отчёты).

---

## 2. Как работать сейчас

### Оператор / продукт

1. Файл загружается (`POST /files/upload` или файл заявки заказа).
2. После записи `File` в БД срабатывает `notifyFileSaved` → DPS ставит `prepare-document` (если формат поддерживается).
3. Статус: `GET /documents/:fileId/prepared`.
4. Повтор: `POST /documents/:fileId/prepare`.
5. **Не использовать** `POST /files-content/:fileId/extract` (410).

### Разработчик backend

**Слои:**

```
FilesService (диск + File в БД + onFileSaved)
       ↓ хук
DocumentPrepareService.enqueuePrepare → job prepare-document
       ↓ engine в input
JobTools: kreuzberg.extract | vision.render + vision.recognize → prepare.apply
       ↓
PreparedDocument (markdown)
       ↓
Потребители (ApplicationChunkReader, …) — только чтение, без enqueue
```

**Ключевые пути:**

| Задача | Куда смотреть |
|--------|----------------|
| Роутинг docx/pdf/… | `document-prepare/router.ts` → `routePreparedEngine` |
| Постановка job | `DocumentPrepareService.enqueuePrepare` |
| Upload-хук | `files/files.service.ts` + `document-prepare-upload.listener.ts` |
| Файл в транзакции (заявка) | `files.create(data, { tx })` + `notifyFileSaved` после commit |
| Effect-загрузка File | `files.effects.get(id)` |
| Чтение markdown заявки | `ApplicationChunkReader.read()` / `getMarkdown()` (Stream) |
| Ошибки extractors | `document-prepare/errors.ts` |
| Vision промпты/рендер | `document-prepare/vision/prompts.ts`, `render-pages.ts` |

**Поддерживаемые форматы (MVP):**

- `DOCUMENT`, `SPREADSHEET`, `TEXT` → kreuzberg  
- `VISUAL` (pdf, jpg, png) → LLM Vision (все PDF через vision на старте)

**Env:** `KREUZBERG_URL`, `DPS_MAX_CONCURRENCY`, `YANDEX_CLOUD_*` — см. `document-prepare/README.md`.

### Анализ заявок заказа

- Джоба `analyse-application` **не** готовит файлы.
- Файловое приложение анализируется только при `PreparedDocument.status === succeeded`.
- Иначе — fail-fast с понятным текстом (`queued` / `running` / `failed`).
- Планируемый контракт: анализ заказа возможен, когда **все** file-applications подготовлены (пока проверка по месту в reader, не на уровне оркестратора заказа).

### Front (ещё не мигрирован)

- `FileCard` + `useExtractFileContent` → старый endpoint (410).
- Целевое: статус/кнопка re-prepare через DPS API (`/documents/...`).

---

## 3. Что ещё живёт параллельно (legacy)

Пока создаёт **когнитивный разрыв** — два мира данных:

| Компонент | Модель | Статус |
|-----------|--------|--------|
| `ApplicationChunkReader`, `analyse-application` | `PreparedDocument` | **Новый путь** |
| `tc-extract.job` | `FileContent` | Не мигрирован |
| Scan jobs: `llm-vision`, `llm-vision-tc`, `ocr` | `FileContent` via `scan.shared.ts` | Legacy, дублирует vision-pipeline |
| `extract-visual.job` | `FileContent` | Job есть, из `analyse-application` **не** вызывается |
| `GET /files-content/:fileId` | read-only история | Сохранён |
| `front` FileCard | extract UI | Сломано (410) |
| `back/` (lowdb) | свой extraction | Вне `back-nest` |

---

## 4. Дублирующаяся логика

### Vision / LLM — два пайплайна

1. **DPS:** `LlmVisionExtractor` + tools + `vision/prompts.ts`, `render-pages.ts`.
2. **Legacy scan:** `scan.shared.ts` → `visionRecognize`, child jobs, запись в `FileContent`.

Промпты `LLM_VISION_*` re-export из `scan.shared` для старых jobs, но реализация poll/render разошлась. Любое изменение промпта/scale/usedPages нужно помнить в двух местах, пока scan не переведён или не удалён.

### Poll Yandex

- Inline цикл в `LlmVisionExtractor.extract()` и в `VisionRecognizeTool` (одинаковая семантика, два копипаста намеренно — KISS, но при смене интервала/условия done — два файла).

### Загрузка файла в tools

`kreuzberg-extract.tool.ts` и `vision-render.tool.ts` повторяют:

```ts
files.effects.get(fileId) → mapError → fail if null → getFilePath
```

Кандидат: `files.effects.require(fileId)` → `Effect<Stored<FileModel>, ExtractError>` (отложено ранее).

### `DocumentExtractor` vs tools

- Kreuzberg: tool вызывает `extractor.extract()` целиком.
- Vision: tool дергает `renderPages` + `submit` + `pollOnce` по отдельности; `extract()` — для порта, дублирует тот же цикл.

### Две модели «извлечённого текста»

`FileContent` (массив `Content[]`, extraction meta) vs `PreparedDocument` (строка markdown). Потребители должны знать, к какой модели они привязаны.

---

## 5. Когнитивная нагрузка и лишние действия

### Для разработчика

| Тема | Нагрузка |
|------|----------|
| Два API извлечения | `/files-content/...` vs `/documents/...` — легко перепутать |
| Где запускать prepare | Только DPS (хук / POST prepare); нельзя «подготовить» из order job |
| `notifyFileSaved` вручную после `{ tx }` | Легко забыть при новом пути создания `File` |
| Engine не в key job | На один `fileId` одна prepare; engine из роутера при enqueue — нельзя два движка параллельно без смены дизайна |
| Vision без кэша images | Проще memo, но re-render при resume — неочевидно без чтения JSDoc tool |
| Kreuzberg limiter vs очередь jobs | Лимит HTTP ≠ лимит числа job в БД; много `queued` prepare нормально, kreuzberg режет на адаптере |

### Для пользователя продукта

| Тема | Нагрузка |
|------|----------|
| Асинхронность | Upload ≠ готовый markdown; нужно ждать prepare |
| Анализ заявки до prepare | Падение с текстом про `PreparedDocument` — ожидаемо, но UX не объясняет ожидание |
| Front ещё на FileContent | Кнопка «извлечь» не работает (410) |
| Re-prepare | Явный POST; автоподготовка не перезапускает при `restore` файла без нового create |

### Лишние / спорные действия (кандидаты на упрощение)

1. **`extract-visual.job`** — мёртвый для analyse-application; можно deprecate/remove.
2. **Две ветки в `prepare-document.job.ts`** — почти зеркальные pipeline (откладывали рефакторинг).
3. **`enqueuePrepareBatch`** — убран; при появлении batch-upload не тащить Swarm без нужды.
4. **410 endpoint extract** — временный мост; после миграции front можно удалить route целиком.
5. **`scan.shared` vision path** — если scan jobs выводятся, удалится большой кусок дублирования.

---

## 6. Что стоило бы упростить (приоритет)

### Высокий

1. **Мигрировать front** на `PreparedDocument` (статус, re-prepare) — убрать путаницу с FileContent UI.
2. **`files.effects.require(fileId)`** — убрать boilerplate в DPS tools.
3. **Единый reader-helper для markdown** — `getPreparedMarkdown(fileId): Effect<string, …>` в `DocumentPrepareService` (сейчас логика статусов в `ApplicationChunkReader` и может понадобиться в `tc-extract`).

### Средний

4. **`tc-extract.job` → PreparedDocument** — закрыть второй мир данных.
5. **Deprecate scan vision jobs** или перевести на вызов DPS / общий extractor без записи в `FileContent`.
6. **Проверка «все application prepared»** на уровне `analyse-order` / batch перед запуском analyse-application (явный gate вместо fail внутри reader).

### Низкий

7. Таблица `engine → steps[]` в `prepare-document.job.ts` вместо двух копий веток.
8. Один приватный `pollUntilDone` в extractor, переиспользуемый tool'ом (если не противоречит KISS).
9. Удалить `POST .../extract` после миграции клиентов.

---

## 7. Карта модулей (после DPS)

```
back-nest/src/
  document-prepare/          # домен DPS (без @JobImpl)
    adapters/                # kreuzberg-http, llm-vision
    vision/                  # prompts, render-pages
    errors.ts
    document-prepare-upload.listener.ts
  jobs/implementations/document-prepare/
    prepare-document.job.ts
    tools/                   # kreuzberg.extract, vision.*, prepare.apply
  files/
    files.service.ts         # onFileSaved, create({ tx }), effects.get
  files-content/             # read-only FileContent, extract → 410
  orders/
    application-chunk-reader.ts   # Effect → PreparedDocument
```

---

## 8. Чеклист для нового кода

- [ ] Новый потребитель текста файла → `PreparedDocument`, не `FileContent`.
- [ ] Не вызывать `enqueuePrepare` из доменов-потребителей (orders, tc) — только хук или явный POST API.
- [ ] Создание `File` в транзакции → `files.create(..., { tx })` + `notifyFileSaved` после commit.
- [ ] JobTool + ToolMemo для шагов prepare, не child JobRun.
- [ ] Промпты vision — из `document-prepare/vision/prompts.ts`, не дублировать в scan без необходимости.
- [ ] Документация на русском: README модуля + `dp.report.md` при изменениях.

---

## 9. Ссылки

| Документ | Назначение |
|----------|------------|
| `patterns.md`, `job-patterns.md`, `effect-patterns.md` | Паттерны для implementer |
| `phase-3-orchestrator-review.md` | Приёмка vision, замечания |
| `phase-4` … `phase-7` | Отчёты по фазам |
| `document-prepare/README.md` | Операционная документация модуля |
| `dp-agents.plan.md` / `dp.report.md` | План и журнал |
