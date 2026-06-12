# Document Prepare Service (DPS)

Отдельный домен подготовки загруженных файлов в унифицированный **markdown**. DPS не знает про заказы, ТУ и отчёты — только «файл на диске → `PreparedDocument`».

## Что делает

- Модель `PreparedDocument` в PostgreSQL (статусы `queued` / `running` / `succeed` / `failed`).
- Роутинг по домену файла (`router.ts`): vision (pdf/jpg/png) → `llm-vision`, остальное (`DOCUMENT`/`SPREADSHEET`/`TEXT`) → `kreuzberg`.
- HTTP API:
  - `GET /documents/:fileId/prepared` — статус и результат;
  - `POST /documents/:fileId/prepare` — ручная (повторная) подготовка.
- Одна корневая джоба `prepare-document` через durable `JobRun`; движок — в `input.engine` и `PreparedDocument.engine`.

## Поток подготовки

1. Источник: хук `onFileSaved` (автоподготовка на upload) **или** `POST /documents/:fileId/prepare`.
2. `DocumentPrepareService.enqueuePrepare(fileId)` → ставит/переиспользует job по key `['prepare-document', fileId]`.
3. Джоба `prepare-document` (engine-agnostic): `markRunning` → `document.extract.v1` → `prepare.apply.v1` → `succeed`.
4. При ошибке: `PreparedDocument.status=failed` + `JobRun.status=failed` с сообщением.

Джоба **не ветвится по механике** движка: она лишь сопоставляет `engine → тул` (`kreuzberg`/`vision`) и запускает его; тул сам приводит файл к `PreparedResult`.

### JobTools (`jobs/implementations/document-prepare/tools/`)

| Tool | Назначение |
|------|------------|
| `document.extract.kreuzberg.v1` | `files.effects.require` → `KreuzbergHttpExtractor.extract()` (single-step) → кэш результата в ToolMemo |
| `document.extract.vision.v1` | `files.effects.require` → render → submit (**checkpoint `opId` в ToolMemo**) → `yandex.poll` → результат; кэш в ToolMemo |
| `prepare.apply.v1` | `markSucceeded` в БД, idempotent через `applied: true` в ToolMemo |

### Экстракторы (`adapters/`)

- **`kreuzberg-http.extractor.ts`** — single-step: multipart `POST /extract` → markdown. Обёрнут в `KreuzbergConcurrencyLimiter` (process-local semaphore, `DPS_MAX_CONCURRENCY`). Health-check вынесен из `extract()` — его отдельно использует `health.controller` (`checkHealth`).
- **`llm-vision.extractor.ts`** — I/O-сервис с гранулярными шагами (`renderPages` / `submit` / `poll` / `toPreparedResult`). Монолитного `extract()` нет: durable-оркестрацию (checkpoint `opId` между submit и poll) ведёт `VisionExtractTool`, поэтому при рестарте job vision **не отправляется повторно**. Промпты в `vision/prompts.ts`, рендер — `vision/render-pages.ts` (scale 2.5, учёт `file.settings.usedPages`).

Ожидание фоновой операции Yandex — единый `YandexService.poll` (дедлайн 30 мин, глобальный семафор `YANDEX_MAX_CONCURRENCY` поверх rate-лимитеров).

## Автоподготовка на upload

`FilesService` не знает о DPS. После `create`/`saveUpload` он вызывает `notifyFileSaved(file)`; подписчики вешаются через `onFileSaved(handler)`. `DocumentPrepareUploadListener` подписывается и fire-and-forget ставит `enqueuePrepare` для поддерживаемых форматов (ошибки — в лог, upload не падает).

Файлы заявок создаются `FilesService.create(fileInput, { tx })` в транзакции с `OrderApplication`, затем `notifyFileSaved` после commit.

## Идемпотентность и 1:1

- На один `fileId` — одна актуальная `PreparedDocument`. Гарантируется **на уровне сервиса**: процесс-локальный per-`fileId` мьютекс в `enqueuePrepare` сериализует конкурентные триггеры (хук + ручной POST + двойной upload). Уникального индекса в БД нет намеренно.
- Реанализ после `succeed`: старый root `JobRun` сносится (чистка memo) → честное переизвлечение. После `failed`/`cancelled`: та же строка переиспользуется, job-runtime resume'ит с чекпойнтов ToolMemo.

## Контракт с kreuzberg REST

Базовый URL: `KREUZBERG_URL` (по умолчанию `http://localhost:8000`).

| Операция | Метод | Endpoint | Тело |
|----------|-------|----------|------|
| Извлечение | `POST` | `/extract` | `multipart/form-data`: `files=@<filename>`, `output_format=markdown` |
| Health | `GET` | `/health` | ответ `{"status":"healthy","version":"…"}` |
| Fallback health | `GET` | `/version` | ответ `{"version":"…"}` |

`GET /health` бэкенда возвращает поле `kreuzberg: { status, version }`.

## Потребители

`ApplicationChunkReader` (Effect API) читает markdown подготовленного файла; подготовку не запускает, на неподготовленном файле — `ApplicationReadError`. Используется `analyse-application`.

## Env

| Переменная | Назначение |
|------------|------------|
| `KREUZBERG_URL` | Базовый URL REST kreuzberg |
| `DPS_MAX_CONCURRENCY` | Лимит параллельных HTTP к kreuzberg |
| `YANDEX_CLOUD_API_KEY` / `YANDEX_CLOUD_FOLDER_ID` | Доступ к Yandex Cloud для LLM Vision |
| `YANDEX_MAX_CONCURRENCY` | Глобальный лимит одновременных запросов к Yandex |

## Вне scope

`tc-extract.job` и legacy `FileContent` (deprecated) — не часть DPS extraction path; используются отдельной фичей Технических Условий.
