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

## Фаза 2 (текущая): kreuzberg для non-vision

Реализована ветка `engine=kreuzberg` для доменов `DOCUMENT`, `SPREADSHEET`, `TEXT`.

**Поток:**

1. `POST /documents/:fileId/prepare` → `DocumentPrepareService.enqueuePrepare` → job `prepare-document`.
2. Job: `markRunning` → `kreuzberg.extract.v1` → `prepare.apply.v1` → `succeeded`.
3. При ошибке: `PreparedDocument.status=failed`, `JobRun.status=failed` с понятным сообщением.

**JobTools** (`jobs/implementations/document-prepare/tools/`):

| Tool | Назначение |
|------|------------|
| `kreuzberg.extract.v1` | Загрузка файла с диска, HTTP kreuzberg, кэш в ToolMemo |
| `prepare.apply.v1` | `markSucceeded` в БД, idempotent через `applied: true` в ToolMemo |

**Размещение:**

- Домен: `back-nest/src/document-prepare/` (без `@JobImpl`).
- Job: `back-nest/src/jobs/implementations/document-prepare/prepare-document.job.ts`.
- HTTP-адаптер: `adapters/kreuzberg-http.extractor.ts`.
- Лимитер: `kreuzberg-concurrency.limiter.ts` — оборачивает фактический POST `/extract`.

### Контракт с kreuzberg REST

Базовый URL: `KREUZBERG_URL` (по умолчанию `http://localhost:8000`).

| Операция | Метод | Endpoint | Тело |
|----------|-------|----------|------|
| Извлечение | `POST` | `/extract` | `multipart/form-data`: `files=@<filename>`, `output_format=markdown` |
| Health | `GET` | `/health` | — ответ `{"status":"healthy","version":"…"}` |
| Fallback health | `GET` | `/version` | — ответ `{"version":"…"}` |

**Ожидаемый ответ POST /extract** (официальная документация kreuzberg):

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

Адаптер также принимает альтернативные формы: `markdown`, `text`, `results[0].content` — для устойчивости. При нераспознанном ответе — `ExtractError` с фрагментом тела (до 500 символов).

**Проверка при запуске контейнера:**

```bash
curl http://localhost:8000/health
curl -F "files=@document.docx" -F "output_format=markdown" http://localhost:8000/extract
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

Перед извлечением адаптер проверяет доступность kreuzberg (`/health`, fallback `/version`). При `down` — быстрый `failed`, без зависания в `running`.

### Env

| Переменная | Назначение |
|------------|------------|
| `KREUZBERG_URL` | Базовый URL REST kreuzberg |
| `KREUZBERG_HOST_PORT` | Порт контейнера (docker-compose) |
| `DPS_MAX_CONCURRENCY` | Лимит параллельных HTTP к kreuzberg (Semaphore в процессе) |

## Не реализовано (следующие фазы)

- **LLM Vision** (`engine=llm-vision`, pdf/jpg/png) — stub «DPS LLM Vision extractor is not implemented yet» (Фаза 3).
- JobTools `vision.render.v1`, `vision.recognize.v1`.
- Автоподготовка на upload (Фаза 4).
- Переключение читателей с `FileContent` (Фаза 5).

## Фаза 1 (завершена)

Инфраструктурный каркас: CRUD, controller, env/docker для kreuzberg, Prisma `PreparedDocument`, reconciliation к одной job `prepare-document`.
