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

## Фаза 1 (текущая, после reconciliation)

Реализован инфраструктурный каркас: CRUD, controller, env/docker для kreuzberg, скелетная job и заглушки адаптеров.

**Размещение:**

- Домен: `back-nest/src/document-prepare/` (без `@JobImpl`).
- Job implementation: `back-nest/src/jobs/implementations/document-prepare/prepare-document.job.ts`.
- Process-local лимитер: `kreuzberg-concurrency.limiter.ts` (`Effect.makeSemaphore`, не используется в HTTP до Фазы 2).

**Не реализовано:**

- HTTP-вызов kreuzberg и LLM Vision (Фазы 2–3);
- JobTool-шаги (`extract`, `recognize`, `apply`);
- автоподготовка на upload (Фаза 4);
- переключение читателей с `FileContent` (Фаза 5).

Stub-джоба помечает `PreparedDocument` как `failed` с сообщением «DPS extractor is not implemented yet».

## Env

| Переменная | Назначение |
|------------|------------|
| `KREUZBERG_URL` | Базовый URL REST kreuzberg |
| `KREUZBERG_HOST_PORT` | Порт контейнера (docker-compose) |
| `DPS_MAX_CONCURRENCY` | Лимит параллельных HTTP к kreuzberg (Фаза 2+) |
