# Отчёт реализации DPS

## Текущий статус

**Фаза 2: kreuzberg integration (non-vision) — выполнена**

`KreuzbergHttpExtractor` (multipart POST /extract), JobTools `kreuzberg.extract.v1` и `prepare.apply.v1`, ветка `engine=kreuzberg` в `prepare-document`, health-gating (`GET /health` + поле `kreuzberg` в backend `/health`). LLM Vision остаётся stub. Читатели `FileContent` и upload-хук не затронуты.

**Следующий шаг:** Фаза 3 — LLM Vision (`vision.render.v1`, `vision.recognize.v1`).

---

## Решения, зафиксированные в плане

1. **DPS** — отдельный домен `back-nest/src/document-prepare/`, не часть `files-content`.
2. **Kreuzberg** — внешний Docker REST-сервис (`ghcr.io/kreuzberg-dev/kreuzberg`), не embedded library.
3. **Non-vision** (`DOCUMENT`, `SPREADSHEET`, `TEXT`) → kreuzberg → markdown.
4. **Vision** (`pdf`, `jpg`, `png`) → LLM Vision; OCR не используется.
5. **Все PDF** на старте → LLM Vision; fast-path для PDF с текстовым слоем — позже.
6. **Автоподготовка** на upload + явный эндпоинт re-prepare.
7. **Queue/concurrency лимиты** — process-local `KreuzbergConcurrencyLimiter` (Semaphore) для глобального лимита HTTP kreuzberg в одном backend-процессе; `Swarm` — для batch enqueue локально, не как глобальный limiter.
8. **`PreparedDocument`** — новая модель; `FileContent` депрекейтится постепенно.
9. **MVP-модель простая** — без `configHash`/`version`; расширение для A/B — отдельной миграцией (`variant`, `config`, `configHash`).
10. **Jobs-with-tools**: одна корневая job **`prepare-document`**, движок в `input.engine`; шаги extract/recognize/apply — JobTool/ToolMemo, не child JobRun. Job implementation — `jobs/implementations/document-prepare/`.
11. **Очередь** — существующий JobsService + PostgreSQL JobRun; Redis/BullMQ не вводим.
12. **Фаза 7** — обязательный аудит зависимостей субагентом (отделить extraction deps от report generation deps).

---

## Следующий шаг

**Фаза 3 — LLM Vision integration**

1. `LlmVisionExtractor`: ConvertService + Yandex/cloud-job.
2. JobTools `vision.render.v1`, `vision.recognize.v1` в `prepare-document` (ветка `engine=llm-vision`).
3. Durable `opId` в ToolMemo для submit→poll.

Паттерны: `.agents/desk/effect-patterns.md`, `.agents/desk/job-patterns.md`.

---

## Журнал изменений

### 2026-06-11 — Фаза 2 DPS: kreuzberg integration

**Сделано:**

- `KreuzbergHttpExtractor`: чтение файла с диска, `POST ${KREUZBERG_URL}/extract` (multipart `files`, `output_format=markdown`), парсинг JSON-массива `[{ content, … }]`, typed `ExtractError`.
- Health: `checkHealth()` — `GET /health`, fallback `GET /version`; поле `kreuzberg` в `GET /health` backend.
- Health-gating: перед extract проверка доступности; при `down` — быстрый `failed`.
- `KreuzbergConcurrencyLimiter.withPermit` оборачивает фактический HTTP-вызов в адаптере.
- JobTools: `kreuzberg.extract.v1` (FilesService + ToolMemo), `prepare.apply.v1` (markSucceeded, idempotent).
- `prepare-document.job.ts`: ветка kreuzberg через tools + progress; llm-vision — stub; ошибки → `markFailed` + failed JobRun.
- Регистрация: `KreuzbergHttpExtractor` в `DocumentPrepareModule`; tools в `JobImplementationsModule`; `HealthModule` импортирует `DocumentPrepareModule`.
- Обновлены `document-prepare/README.md`, `dp.report.md`.

**HTTP-контракт (зафиксирован для проверки):**

- `POST /extract`: `files=@<file>`, `output_format=markdown`.
- Ответ: JSON-массив, markdown в `content` (первый элемент).
- Health: `GET /health` → `{"status":"healthy","version":"…"}`.

**Проверки:**

- `npx tsc` в `back-nest` — OK.
- Live kreuzberg не запускался — интеграция против контейнера не проверена.

**Ограничения:**

- Vision/pdf/jpg/png — stub (Фаза 3).
- Upload-хук, readers, Prisma migrations — без изменений.
- `meta` сохраняет `mimeType`, `kreuzbergMetadata`, `tables` из ответа API при наличии.

**Fixup (re-prepare idempotency):**

- `enqueuePrepare`: перед сбросом `PreparedDocument` проверяет root JobRun по key `['prepare-document', fileId]`.
- `succeed` → `deleteRunTree` старого root, затем сброс записи и новый `jobs.start`.
- `running`/`queued` → без сброса markdown/meta; возврат текущей `PreparedDocument` и существующего JobRun (при необходимости синхронизация `jobRunId`).
- `failed`/`cancelled` / нет run — прежний сброс + `jobs.start` (переиспользует строку по key; input не обновляется из-за `upsert update:{}`, в MVP `preparedDocumentId` тот же).
- `back-nest/src/document-prepare/document-prepare.service.ts`

**Файлы:**

- `back-nest/src/document-prepare/adapters/kreuzberg-http.extractor.ts`
- `back-nest/src/document-prepare/document-prepare.module.ts`
- `back-nest/src/jobs/implementations/document-prepare/prepare-document.job.ts`
- `back-nest/src/jobs/implementations/document-prepare/tools/kreuzberg-extract.tool.ts`
- `back-nest/src/jobs/implementations/document-prepare/tools/prepare-apply.tool.ts`
- `back-nest/src/jobs/job-implementations.module.ts`
- `back-nest/src/health/health.controller.ts`
- `back-nest/src/health/health.module.ts`
- `back-nest/src/document-prepare/README.md`

---

### 2026-06-11 — Reconciliation Фазы 1 DPS

**Контекст:** приведение временной реализации Фазы 1 к целевой архитектуре (одна job, engine в input, job в `jobs/implementations/`).

**Сделано:**

- Удалены временные stub jobs: `document-prepare/jobs/prepare-document-kreuzberg.job.ts`, `prepare-document-llm.job.ts`, `prepare-document.shared.ts`.
- Создана `jobs/implementations/document-prepare/prepare-document.job.ts`: id `prepare-document`, input `{ fileId, preparedDocumentId, engine }`, safe stub (running → failed → `Effect.fail`).
- `DocumentPrepareModule` без `@JobImpl`; экспортирует `DocumentPrepareService`, `KreuzbergConcurrencyLimiter`.
- `JobImplementationsModule`: `PrepareDocumentJob` в providers, импорт `DocumentPrepareModule` сохранён.
- `router.ts`: `PREPARE_DOCUMENT_JOB_ID`, `prepareJobKey(fileId)` без engine в key; убран `jobIdForEngine`.
- `DocumentPrepareService.enqueuePrepare`: `jobs.start('prepare-document', { fileId, preparedDocumentId, engine }, ['prepare-document', fileId])`.
- Каркас `kreuzberg-concurrency.limiter.ts`: Promise-semaphore + `withPermit(effect)` (Effect.Semaphore недоступен в effect@3); permit освобождается через `Effect.acquireUseRelease` (finalizer на любом exit: success/failure/defect/interruption).
- Обновлены `document-prepare/README.md`, `dp.report.md`.

**Проверки:**

- `npx tsc` в `back-nest` — OK (после правки limiter finalizer — OK).

**Ограничения:**

- HTTP kreuzberg, LLM Vision, JobTools, upload-хук, readers — без изменений (Фазы 2–5).

---

### 2026-06-11 — Корректировка архитектурных решений + desk-паттерны

**Контекст:** после завершения Фазы 1 пользователь уточнил целевую форму DPS.

**Новые решения (зафиксированы в `dp-agents.plan.md`):**

- Одна root job **`prepare-document`** вместо `prepare-document:kreuzberg` / `prepare-document:llm`.
- Движок (`kreuzberg` / `llm-vision`) — в `input.engine` и `PreparedDocument.engine`, не в job id.
- Job implementation — `back-nest/src/jobs/implementations/document-prepare/`; доменный модуль без `@JobImpl`.
- Глобальный лимит kreuzberg — singleton `KreuzbergConcurrencyLimiter` с process-local Semaphore; Swarm только для локального batch/enqueue.
- Distributed limiter — отложен (несколько backend-инстансов).

**Сделано (только документация):**

- Создана `.agents/desk/effect-patterns.md` — Effect.gen, tryLabeledPromise, ToolMemo, Semaphore limiter.
- Создана `.agents/desk/job-patterns.md` — одна `prepare-document`, размещение файлов, JobTool, миграция Фазы 1.
- Обновлён `.agents/plans/dp-agents.plan.md` под новые решения.
- Обновлён `.agents/plans/dp.report.md` — статус reconciliation, журнал.

**Код не менялся** — reconciliation реализации — следующий шаг для implementer.

---

### 2026-06-11 — Фаза 1 — инфраструктурный каркас DPS

**Сделано:**

- Prisma: enum `PrepareStatus`, model `PreparedDocument`, relation `File.preparedDocuments`, миграция `20260611120000_prepared_documents`.
- Docker/env: сервис `kreuzberg` в `docker-compose.yml`; переменные `KREUZBERG_URL`, `KREUZBERG_HOST_PORT`, `DPS_MAX_CONCURRENCY` в `.env.example`; валидация и getters в `env.schema.ts` / `app-config.service.ts` (`kreuzbergUrl`, `dpsMaxConcurrency`; host port только в compose).
- Модуль `back-nest/src/document-prepare/`: service (CRUD, `enqueuePrepare`), controller (`GET/POST`), `extractor.port.ts`, `router.ts`, заглушки адаптеров.
- Stub jobs `prepare-document:kreuzberg` / `prepare-document:llm`: `running` → `failed` с текстом «DPS extractor is not implemented yet»; JobRun тоже `failed`.
- `DocumentPrepareModule` в `AppModule`; jobs провайдятся в `DocumentPrepareModule`, `JobImplementationsModule` импортирует модуль для DI/discovery.
- README модуля на русском; опечатка «домуль» → «модуль» в `dp.plan.md`.

**Решения:**

- Re-prepare обновляет существующую запись на `fileId` (не создаёт дубликат).
- Stub job не оставляет запись в `running` — сразу `failed`, чтобы ручной POST не «зависал».
- Циклический импорт Jobs ↔ DPS избегнут: `JobsModule` global, jobs живут в `DocumentPrepareModule`, `DocumentPrepareService` не импортирует `JobImplementationsModule`.
- Миграция создана вручную по локальному pattern (`prisma/migrations/`); для dev без migrate — `pnpm prisma:push` или `pnpm prisma:migrate`.

**Файлы:**

- `back-nest/prisma/schema.prisma`
- `back-nest/prisma/migrations/20260611120000_prepared_documents/migration.sql`
- `docker-compose.yml`, `.env.example`
- `back-nest/src/config/env.schema.ts`, `app-config.service.ts`
- `back-nest/src/document-prepare/**`
- `back-nest/src/app.module.ts`
- `back-nest/src/jobs/job-implementations.module.ts`
- `agents/plans/dp.plan.md` (опечатка)

**Проверки:**

- `npx dotenv -e ../.env -- prisma generate` — OK (Prisma Client 7.8.0).
- `npx tsc` в `back-nest` — OK.
- `pnpm` недоступен в shell окружения агента; команды выполнены через `npx`.
- Миграция не применялась к БД (нет destructive ops); для локальной БД: `pnpm prisma:migrate` или `pnpm prisma:push`.

**Ограничения Фазы 1:**

- Нет HTTP kreuzberg / LLM Vision, JobTools, upload-хука, переключения readers.
- `POST /documents/:fileId/prepare` возвращает `failed` на PreparedDocument после stub job.

---
