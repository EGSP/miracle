# Document Prepare Service (DPS)

Отдельный домен подготовки загруженных файлов в унифицированный **markdown**. DPS не знает про заказы, ТУ и отчёты — только «файл на диске → `PreparedDocument`».

## Что делает

- Модель `PreparedDocument` в PostgreSQL (статусы `queued` / `running` / `succeed` / `failed`).
- Роутинг по домену файла (`router.ts`): vision (pdf/jpg/png) → `llm-vision`, остальное (`DOCUMENT`/`SPREADSHEET`/`TEXT`) → `kreuzberg`.
- HTTP API:
  - `GET /documents/:fileId` — подготовленный документ (`PreparedDocument`) или `null`;
  - `GET /documents/:fileId/status` — лёгкий статус (`{ status }` или `null`) для поллинга;
  - `POST /documents/:fileId/prepare` — поставить (повторную) подготовку в очередь, отдаёт `{ runId }` (id `PreparedDocument`, имя поля историческое).

## Архитектура: пайплайн — фундамент, не джобы

Обработка идёт через **движок линий** {@link DpsPipeline}, а не через job-движок. Kreuzberg/LibreOffice работают «в моменте» — джоба им не нужна; durable-состояние целиком в `PreparedDocument`. Джоба (инструмент для долгих операций) применяется только там, где нужно хранить состояние между submit и результатом — это Yandex (LLM Vision), линия которого запускает джобу как свой этап (Phase 2; vision сейчас выключен).

- **Сервис** (`DocumentPrepareService`) только СТАВИТ запрос: создаёт/сбрасывает `queued`-строку и зовёт `pipeline.submit(fileId)`. На старте — реконсиляция (re-submit `queued`/`running` из БД, т.к. линии эфемерны).
- **Движок** (`DpsPipeline`) владеет переходами статуса `PreparedDocument` (`running`/`succeed`/`failed`).
- Состояние читается по `fileId` (`GET /documents/:fileId[/status]`), а не возвращается из `enqueue`.

## Поток подготовки

1. Источник: хук `onFileSaved` (автоподготовка на upload) **или** `POST /documents/:fileId/prepare`.
2. `DocumentPrepareService.enqueuePrepare(fileId)` → `queued`-строка → `DpsPipeline.submit(fileId)`.
3. `submit`: `markRunning` → маршрутизация в линию (см. ниже). Терминальная стадия пишет `markSucceeded`/`markFailed`.

### Линии обработки (`dps-pipeline.service.ts`, `lane.ts`)

In-memory пайплайн с backpressure поверх durable-очереди запросов в БД (`PreparedDocument.status`).
`DpsPipeline.submit(fileId)` — единственная точка маршрутизации:

- **визуальные** (pdf/jpg/png) → **линия Yandex** (LLM Vision). Линия запускает durable-джобу `prepare-vision` как свой этап (операция долгая: submit → poll, состояние через checkpoint `opId`). Реальная LLM-разметка гейтится `LLM_VISION_ENABLED` (по умолчанию ВЫКЛ → джоба падает ошибкой, VISUAL не размечается автоматически). Завершённый прежний прогон джобы сносится при re-prepare.
- **`.doc`** → **линия LibreOffice** (`LIBREOFFICE_CONVERT_MAX_CONCURRENCY` воркеров): конвертация в `.docx` (временный файл в `uploads/temp`) → передача заказа в линию Kreuzberg.
- **остальное** → **линия Kreuzberg** (`DPS_MAX_CONCURRENCY` воркеров): `POST /extract` → markdown + дедуп таблиц; временный `.docx` удаляется после извлечения (`Effect.ensuring`).

`Lane<Item>` = `Queue.bounded` (backpressure: `offer` suspend-ит при полной очереди) + N воркеров-демонов. Стадии расцеплены: полная очередь Kreuzberg тормозит воркер LibreOffice → backpressure до сервиса, без знания одной стадии о другой. Обработчики линий не падают — исход всегда пишется в `PreparedDocument`.

### Экстракторы (`adapters/`)

- **`kreuzberg-http.extractor.ts`** — чистый HTTP: `runExtract(filePath)` = multipart `POST /extract` → markdown (оркестрацию/лимиты ведёт `DpsPipeline`). Health-check (`checkHealth`) отдельно использует `health.controller`.
- **`libreoffice-http.converter.ts`** — `convert(bytes, fileName)` → `.docx` через unoserver REST (`POST /request`).
- **`llm-vision.extractor.ts`** — I/O-сервис с гранулярными шагами (`renderPages` / `submit` / `poll` / `toPreparedResult`). Durable-оркестрацию (checkpoint `opId` между submit и poll) ведёт `VisionExtractTool` (Phase 2: его запустит линия Yandex). Промпты в `vision/prompts.ts`, рендер — `vision/render-pages.ts` (scale 2.5, учёт `file.settings.usedPages`).

Ожидание фоновой операции Yandex — единый `YandexService.poll` (дедлайн 30 мин, глобальный семафор `YANDEX_MAX_CONCURRENCY` поверх rate-лимитеров).

## Автоподготовка на upload

`FilesService` не знает о DPS. После `create`/`saveUpload` он вызывает `notifyFileSaved(file)`; подписчики вешаются через `onFileSaved(handler)`. `DocumentPrepareUploadListener` подписывается и fire-and-forget ставит `enqueuePrepare` для поддерживаемых форматов (ошибки — в лог, upload не падает).

Файлы заявок создаются `FilesService.create(fileInput, { tx })` в транзакции с `OrderApplication`, затем `notifyFileSaved` после commit.

## Идемпотентность и 1:1

- На один `fileId` — одна актуальная `PreparedDocument`. Гарантируется **на уровне сервиса**: процесс-локальный per-`fileId` мьютекс в `enqueuePrepare` сериализует конкурентные триггеры (хук + ручной POST + двойной upload). Уникального индекса в БД нет намеренно.
- Пока запись `running`/`queued` — повторный `enqueue` возвращает её как есть (не дублирует, не пере-обрабатывает).
- Re-prepare завершённой записи (`succeed`/`failed`) — **всегда свежее**: прежняя строка `PreparedDocument` удаляется и создаётся новая `queued`, движок обрабатывает заново.
- Восстановление после краша — `DocumentPrepareService.onApplicationBootstrap`: re-submit всех `queued`/`running` записей в движок (линии in-memory, поэтому durable-источник — `PreparedDocument`).

## Контракт с kreuzberg REST

Базовый URL: `KREUZBERG_URL` (по умолчанию `http://localhost:8000`).

| Операция | Метод | Endpoint | Тело |
|----------|-------|----------|------|
| Извлечение | `POST` | `/extract` | `multipart/form-data`: `files=@<filename>`, `output_format=markdown`, `config` (JSON: disable_ocr, include_document_structure, …) |
| Health | `GET` | `/health` | ответ `{"status":"healthy","version":"…"}` |
| Fallback health | `GET` | `/version` | ответ `{"version":"…"}` |

`GET /health` бэкенда возвращает поле `kreuzberg: { status, version }`.

## Потребители

`ApplicationChunkReader` (Effect API) читает markdown подготовленного файла; подготовку не запускает, на неподготовленном файле — `ApplicationReadError`. Используется `analyse-application`.

## Env

| Переменная | Назначение |
|------------|------------|
| `KREUZBERG_URL` | Базовый URL REST kreuzberg |
| `DPS_MAX_CONCURRENCY` | Воркеры линии Kreuzberg (параллельные `/extract`) |
| `LIBREOFFICE_CONVERT_URL` | Базовый URL сервиса конвертации .doc → .docx (unoserver) |
| `LIBREOFFICE_CONVERT_MAX_CONCURRENCY` | Воркеры линии LibreOffice (unoserver — 1 файл за раз) |
| `YANDEX_CLOUD_API_KEY` / `YANDEX_CLOUD_FOLDER_ID` | Доступ к Yandex Cloud для LLM Vision |
| `YANDEX_MAX_CONCURRENCY` | Глобальный лимит одновременных запросов к Yandex |
| `LLM_VISION_ENABLED` | Включить LLM Vision-разметку VISUAL (по умолчанию выкл — vision-джоба падает ошибкой) |

## Вне scope

`tc-extract.job` и legacy `FileContent` (deprecated) — не часть DPS extraction path; используются отдельной фичей Технических Условий.
