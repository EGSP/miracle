# Document Prepare Service (DPS)

Отдельный домен подготовки загруженных файлов в унифицированный **markdown**. DPS не знает про заказы, ТУ и отчёты — только «файл на диске → `PreparedDocument`».

Архитектурный план: [`.agents/plans/dp-agents.plan.md`](../../../.agents/plans/dp-agents.plan.md).

## MVP

- Модель `PreparedDocument` в PostgreSQL (статусы `queued` / `running` / `succeeded` / `failed`).
- Роутинг по домену файла: non-vision → kreuzberg, vision (pdf/jpg/png) → LLM Vision.
- HTTP API:
  - `GET /documents/:fileId/prepared` — статус и результат;
  - `POST /documents/:fileId/prepare` — ручная (повторная) подготовка.
- Одна корневая джоба `prepare-document` через durable `JobRun`; движок — в `input.engine` и `PreparedDocument.engine`.

## Фаза 3 (текущая): LLM Vision для pdf/jpg/png

Реализована ветка `engine=llm-vision` для домена `VISUAL` (pdf, jpg, png).

**Поток:**

1. `POST /documents/:fileId/prepare` → `DocumentPrepareService.enqueuePrepare` → job `prepare-document`.
2. Job: `markRunning` → `vision.render.v1` → `vision.recognize.v1` → `prepare.apply.v1` → `succeeded`.
3. При ошибке: `PreparedDocument.status=failed`, `JobRun.status=failed` с понятным сообщением.

**JobTools** (`jobs/implementations/document-prepare/tools/`):

| Tool | Назначение |
|------|------------|
| `vision.render.v1` | `FilesService.effects.get` → PDF/JPEG через `ConvertService`, jpg/png → dataUrl; **без** кэша `images` в ToolMemo (re-render при resume) |
| `vision.recognize.v1` | Yandex Vision submit→poll; durable `opId`, `yandexResponse`, `markdown` в ToolMemo |
| `prepare.apply.v1` | `markSucceeded` в БД, idempotent через `applied: true` в ToolMemo |

**Адаптер:** `adapters/llm-vision.extractor.ts` (`implements DocumentExtractor`)

- Промпты: `LLM_VISION_PROMPT`, `LLM_VISION_USER` в `vision/prompts.ts` (не TC_VISION).
- Рендер страниц: `vision/render-pages.ts` (`renderVisionPages`).
- `extract()`: полный цикл render → submit → poll → `PreparedResult`; гранулярные методы (`renderPages`, `submit`, `pollOnce`, …) — для ToolMemo в `vision.recognize.v1`.
- Poll до завершения: inline в `extract()` и в `vision.recognize.v1` (интервал 3000 ms).
- Модель: `YANDEX_MODELS.vision`, `maxOutputTokens: 40000`.
- PDF: `ConvertService.pdfToImages` (scale 2.5), учёт `file.settings?.usedPages` через `validatePageRanges`.
- Результат: `PreparedResult` с единой строкой `markdown` и `meta` (`source: llm-vision`, `model`, `pageCount`, `usage`).

**Durable recovery:** при рестарте job во время распознавания `vision.recognize.v1` восстанавливает `opId` из ToolMemo и продолжает polling без повторной отправки.

## Фаза 2: kreuzberg для non-vision

Реализована ветка `engine=kreuzberg` для доменов `DOCUMENT`, `SPREADSHEET`, `TEXT`.

**Поток:**

1. `POST /documents/:fileId/prepare` → job `prepare-document`.
2. Job: `markRunning` → `kreuzberg.extract.v1` → `prepare.apply.v1` → `succeeded`.

**JobTools:**

| Tool | Назначение |
|------|------------|
| `kreuzberg.extract.v1` | `FilesService.effects.get` → HTTP kreuzberg, кэш в ToolMemo |
| `prepare.apply.v1` | `markSucceeded` в БД, idempotent через `applied: true` в ToolMemo |

**Размещение:**

- Домен: `back-nest/src/document-prepare/` (без `@JobImpl`).
- Job: `back-nest/src/jobs/implementations/document-prepare/prepare-document.job.ts`.
- HTTP-адаптер kreuzberg: `adapters/kreuzberg-http.extractor.ts`.
- LLM Vision-адаптер: `adapters/llm-vision.extractor.ts`.
- Лимитер kreuzberg: `kreuzberg-concurrency.limiter.ts`.

### Контракт с kreuzberg REST

Базовый URL: `KREUZBERG_URL` (по умолчанию `http://localhost:8000`).

| Операция | Метод | Endpoint | Тело |
|----------|-------|----------|------|
| Извлечение | `POST` | `/extract` | `multipart/form-data`: `files=@<filename>`, `output_format=markdown` |
| Health | `GET` | `/health` | — ответ `{"status":"healthy","version":"…"}` |
| Fallback health | `GET` | `/version` | — ответ `{"version":"…"}` |

**Ожидаемый ответ POST /extract:**

```json
[
  {
    "content": "…markdown…",
    "mime_type": "application/vnd…",
    "metadata": { "page_count": 10 },
    "tables": []
  }
]
```

### Health в backend

`GET /health` возвращает поле `kreuzberg`:

```json
{
  "status": "ok",
  "timestamp": "…",
  "kreuzberg": { "status": "up", "version": "4.6.3" }
}
```

### Env

| Переменная | Назначение |
|------------|------------|
| `KREUZBERG_URL` | Базовый URL REST kreuzberg |
| `KREUZBERG_HOST_PORT` | Порт контейнера (docker-compose) |
| `DPS_MAX_CONCURRENCY` | Лимит параллельных HTTP к kreuzberg (Semaphore в процессе) |
| `YANDEX_CLOUD_API_KEY` | API-ключ Yandex Cloud для LLM Vision |
| `YANDEX_CLOUD_FOLDER_ID` | Folder ID Yandex Cloud |

## Не реализовано (следующие фазы)

- Автоподготовка на upload (Фаза 4).
- Переключение читателей с `FileContent` (Фаза 5).
- Deprecation legacy extraction (Фаза 6).

## Фаза 1 (завершена)

Инфраструктурный каркас: CRUD, controller, env/docker для kreuzberg, Prisma `PreparedDocument`, reconciliation к одной job `prepare-document`.
