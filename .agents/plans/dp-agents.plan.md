# План архитектуры: Document Prepare Service (DPS)

Отдельный домен внутри `miracle` (`back-nest`) для подготовки загруженных файлов в унифицированный **markdown**. DPS не знает про orders, технические условия и отчёты — он только превращает «файл на диске → подготовленный документ», а потребители читают результат из `PreparedDocument`.

---

## Цели

- Единый асинхронный durable-конвейер подготовки документов вместо смешанной модели «синхронно в HTTP-запросе + отдельные vision-джобы».
- Унифицированный выход **markdown** для всех поддерживаемых форматов.
- Разделение стратегий: **kreuzberg** для non-vision, **LLM Vision** для pdf/jpg/png.
- Автоматическая подготовка при upload с контролируемой нагрузкой на kreuzberg.
- Новая доменная модель `PreparedDocument` с постепенным выводом из эксплуатации `FileContent`.
- Совместимость с переездом джоб на **jobs-with-tools** (`JobTool` + `ToolMemo`).

## Не-цели (MVP)

- OCR как отдельный путь извлечения — **не используем**.
- Native-биндинг `@kreuzberg/node` — **не используем**; только внешний Docker REST-сервис.
- Быстрый путь «PDF с текстовым слоем → kreuzberg» — **откладываем**; на старте все PDF идут в LLM Vision.
- A/B-тесты, параллельные вычитки и несколько вариантов подготовки на один файл — **не в MVP**, но схема должна допускать расширение без ломки.
- Замена пакетов для **формирования отчётов** (exceljs/xlsx в генерации отчётов и т.п.) — вне scope DPS.

---

## Принятые решения

| # | Решение |
|---|---------|
| 1 | DPS — отдельный модуль `back-nest/src/document-prepare/`, не часть `files-content`. |
| 2 | Kreuzberg — **внешний Docker REST-сервис** (`ghcr.io/kreuzberg-dev/kreuzberg`), не embedded library. |
| 3 | Все **non-vision** форматы (`DOCUMENT`, `SPREADSHEET`, `TEXT`) идут через kreuzberg → markdown. |
| 4 | Все **vision** форматы (`pdf`, `jpg`, `png` — домен `VISUAL`) идут в **LLM Vision**. OCR не нужен. |
| 5 | На старте **все PDF** → LLM Vision. Альтернативный путь для PDF с текстовым слоем возможен позже через роутер. |
| 6 | Автоподготовка запускается на **upload** (плюс явный эндпоинт re-prepare). |
| 7 | Обязательны **queue/concurrency лимиты**, чтобы не перегружать kreuzberg при массовой загрузке. |
| 8 | Новая модель **`PreparedDocument`**; `FileContent` депрекейтится постепенно по фазам. |
| 9 | MVP-модель **простая** — без `configHash` и `version`; расширение для A/B — отдельной миграцией. |
| 10 | Одна корневая job **`prepare-document`**. Движок (`kreuzberg` / `llm-vision`) — в `input.engine` и поле `PreparedDocument.engine`. Внутренние шаги (`extract`, `recognize`, `apply`) — **JobTool/ToolMemo** внутри одного `JobRun`, не дочерние JobRun. |
| 11 | Очередь — существующий durable job-движок на PostgreSQL (`JobRun`). Redis/BullMQ не вводим. |
| 12 | В конце реализации — **обязательный аудит зависимостей** субагентом (см. Фаза 7). |

### Контекст: что есть сейчас

- Синхронное извлечение non-vision в `back-nest/src/files-content/extraction/*` (mammoth, SheetJS, papaparse).
- Асинхронное vision-извлечение через джобы `llm-vision` / `llm-vision-tc` с записью в `FileContent`.
- Результат в `FileContent` без Prisma-relation к `File`, разнородный формат выхода.
- `ConvertService` (`back-nest/src/convert/`) — PDF → JPEG для LLM Vision, переиспользуем.
- Домены файлов — `types/src/file-types.ts` (`VISUAL`, `DOCUMENT`, `SPREADSHEET`, `TEXT`).

---

## Целевая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         Upload / API                            │
│  FilesService.saveUpload  →  DocumentPrepareService.enqueue     │
│  POST /documents/:fileId/prepare  (re-prepare)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              DocumentPrepareService (DPS domain)                │
│  • CRUD PreparedDocument                                        │
│  • Router по FileDomain                                         │
│  • Постановка root job                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ prepare-document             │
              │ JobRun (durable)             │
              │ input.engine → dispatch      │
              │ ├─ kreuzberg.extract.v1      │  engine=kreuzberg
              │ ├─ vision.render.v1        │  engine=llm-vision
              │ ├─ vision.recognize.v1       │
              │ └─ prepare.apply.v1          │
              │    (ToolMemo)                │
              └──────────────┬───────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ Kreuzberg Docker REST    │   │ ConvertService + LLM     │
│ POST /extract (multipart)│   │ (Yandex / cloud-job)     │
└────────────┬─────────────┘   └────────────┬─────────────┘
             │                               │
             └──────────────┬────────────────┘
                            ▼
                 ┌─────────────────────┐
                 │  PreparedDocument   │
                 │  (markdown + meta)  │
                 └─────────────────────┘
                            │
                            ▼
              Потребители: orders, tc-extract, вычитки
```

### Структура модулей

Доменный модуль **без `@JobImpl`** — service, controller, router, adapters, limiter:

```
back-nest/src/document-prepare/
  document-prepare.module.ts
  document-prepare.service.ts        # CRUD + постановка job
  document-prepare.controller.ts     # GET статус/результат, POST prepare
  extractor.port.ts                  # интерфейс DocumentExtractor
  router.ts                          # выбор engine по FileDomain
  adapters/
    kreuzberg-http.extractor.ts      # HTTP multipart → markdown
    llm-vision.extractor.ts          # ConvertService + LLM
  kreuzberg-concurrency.limiter.ts   # process-local Semaphore
```

Job implementation — в `jobs/implementations/`:

```
back-nest/src/jobs/implementations/document-prepare/
  prepare-document.job.ts            # @JobImpl root
  tools/
    kreuzberg-extract.tool.ts
    vision-render.tool.ts
    vision-recognize.tool.ts
    prepare-apply.tool.ts
```

`DocumentPrepareModule` экспортирует сервисы/адаптеры/limiter. `JobImplementationsModule` импортирует `DocumentPrepareModule` и регистрирует `PrepareDocumentJob` + tool providers.

### Порт экстрактора

```ts
interface DocumentExtractor {
  readonly engine: 'kreuzberg' | 'llm-vision';
  extract(
    file: FileModel,
    path: string,
  ): Effect.Effect<PreparedResult, ExtractError, ...>;
}
```

Роутер по `FileDomain` (`getFileDomain` из `@miracle/types`):

| Домен | Стратегия | `input.engine` |
|-------|-----------|----------------|
| `DOCUMENT` | kreuzberg | `kreuzberg` |
| `SPREADSHEET` | kreuzberg | `kreuzberg` |
| `TEXT` | kreuzberg | `kreuzberg` |
| `VISUAL` (pdf/jpg/png) | LLM Vision | `llm-vision` |

Постановка: одна job `prepare-document`, key `['prepare-document', fileId]`. Engine не включается в key в MVP — на один `fileId` одна актуальная подготовка; engine определяется роутером при enqueue.

Движок спрятан за портом: смена реализации (native kreuzberg, PDF fast-path) — только адаптер/ветка внутри job или роутера.

---

## Доменная модель MVP: `PreparedDocument`

### Принцип: простая модель в MVP

В MVP **не добавляем** `configHash`, `version`, `label` и прочие поля для вариантов подготовки. На один `fileId` в обычном режиме — **одна актуальная** запись `PreparedDocument` (или перезапись при re-prepare). Идемпотентность джобы обеспечивается `keyHash` на уровне `JobRun`, а не дублированием полей в модели.

### Схема Prisma (MVP)

```prisma
enum PrepareStatus {
  queued
  running
  succeeded
  failed
}

model PreparedDocument {
  id        String        @id @default(uuid())
  file      File          @relation(fields: [fileId], references: [id])
  fileId    String
  status    PrepareStatus
  engine    String        // 'kreuzberg' | 'llm-vision'
  markdown  String?       // унифицированный выход
  pages     Json?         // [{ page, markdown }] для постраничных (vision/pdf)
  meta      Json?         // metadata, tables, detectedMime, tokens, engineVersion
  error     String?
  jobRunId  String?       // связь с JobRun
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  deletedAt DateTime?

  @@index([fileId])
  @@index([status])
  @@index([fileId, status])
}
```

`File` получает relation `preparedDocuments PreparedDocument[]` (в отличие от «висящего» `FileContent.fileId` без relation).

### Расширение для A/B позже

Когда понадобятся параллельные вычитки, A/B-тесты промптов/моделей, разные стратегии подготовки или повторные прогоны с разными конфигами — **миграцией** добавить:

| Поле | Назначение |
|------|------------|
| `variant` | Человекочитаемая метка: `baseline`, `gpt-prompt-v2` |
| `config` | Json с фактическими параметрами (модель, промпт, опции kreuzberg) |
| `configHash` | Канонический хэш `engine + config` для идемпотентности и идентичности варианта |

`configHash` считать через существующий `hashKey()` из `back-nest/src/jobs/framework/hash-key.ts`. Отдельное поле `version` как счётчик **не нужно** — роль закрывают «несколько строк на `fileId` + `configHash` + `createdAt`».

Индекс `@@index([fileId, configHash])` добавить вместе с полями. Потребители (анализ, вычитка) смогут выбирать вариант по `variant` или `configHash` без переделки конвейера.

---

## Очередь и лимиты

### Базовый механизм

Переиспользуем **JobsService** + durable `JobRun` на PostgreSQL:

- Идемпотентность root job: `keyHash(['prepare-document', fileId])`.
- Восстановление после рестарта — штатный `onApplicationBootstrap`.
- LLM durable-логика (`opId` до поллинга) — в `vision.recognize.v1` ToolMemo (перенос из `common/cloud-job.ts`).

### Где ставить concurrency limit

**Проблема:** `Effect.all` / `Swarm.run` ограничивают параллельность **только внутри одного вызова**. Независимые upload/re-prepare создают отдельные scope — Swarm не является глобальным лимитером kreuzberg.

**Решение — три уровня:**

1. **HTTP-адаптер kreuzberg** — singleton Nest provider `KreuzbergConcurrencyLimiter` / `DpsConcurrencyLimiter` с process-local `Effect.Semaphore` (`DPS_MAX_CONCURRENCY`, рекомендуемое начальное значение: 4–8). Оборачивает фактический HTTP POST к kreuzberg через `withPermit`. Охват: **один backend-процесс** (Nest/PM2). Для нескольких инстансов позже — distributed limiter (Redis, БД advisory locks, отдельная очередь).
2. **Батч-постановка при upload** — `Swarm.run(files, prepareOne, { failureMode: 'partial', concurrency: N })` из `back-nest/src/jobs/framework/swarm.ts` для локальной параллельной enqueue/обработки; не заменяет глобальный limiter из п.1.
3. **Контейнер kreuzberg** — `KREUZBERG_MAX_UPLOAD_SIZE_MB=50`; при упоре в throughput — горизонтальное масштабирование реплик.

**LLM Vision** лимитируется отдельно — существующий `RateLimiter` в `YandexService`; не смешивать с лимитом kreuzberg.

Справочник паттернов: `.agents/desk/effect-patterns.md`, `.agents/desk/job-patterns.md`.

### Health-gating

Проверка доступности kreuzberg (healthcheck контейнера / GET версии) в `HealthModule`. При недоступности — быстрый `failed` с понятной ошибкой, а не зависание в `running`.

### Env

| Переменная | Назначение |
|------------|------------|
| `KREUZBERG_URL` | Базовый URL (`http://localhost:8000`) |
| `KREUZBERG_HOST_PORT` | Порт публикации контейнера |
| `DPS_MAX_CONCURRENCY` | Лимит одновременных запросов к kreuzberg |

---

## Job design (jobs-with-tools)

### Принцип

Идёт переезд на **`JobTool`** (`back-nest/src/jobs/framework/job-tool.ts`): typed-операция внутри одного `JobRun`, durable-память в `memo.tool_calls[keyHash]`, **без дочерних узлов дерева**.

Для DPS:

- **Одна корневая job** `prepare-document`.
- Движок — в `input.engine` (`'kreuzberg' | 'llm-vision'`); диспетчеризация внутри job.
- Шаги `extract` / `recognize` / `apply` — **JobTool + ToolMemo**, не child JobRun.

### `prepare-document`

```
JobRun key: ['prepare-document', fileId]
input: { fileId, preparedDocumentId, engine }

engine=kreuzberg:
  kreuzberg.extract.v1   — HTTP multipart POST /extract → markdown
  prepare.apply.v1       — запись PreparedDocument (succeeded/failed)

engine=llm-vision:
  vision.render.v1       — ConvertService: pdf→jpg / image as-is
  vision.recognize.v1    — LLM submit→poll, opId в ToolMemo
  prepare.apply.v1       — запись PreparedDocument (succeeded/failed)
```

Тулы версионируем в `type` (`...v1` → `...v2` при смене промпта/алгоритма) — новый durable-слот без ломки старых прогонов.

Реализация: `back-nest/src/jobs/implementations/document-prepare/prepare-document.job.ts`. Регистрация в `JobImplementationsModule`.

---

## API и интеграция с upload

### Триггер на upload

В `FilesService.saveUpload` (и при создании `OrderApplication` с файлом) — вызов `DocumentPrepareService.enqueuePrepare(fileId)`:

1. Определить `FileDomain` по расширению и `engine` через роутер.
2. Поставить job `prepare-document` с `input.engine`.
3. Создать/обновить `PreparedDocument` со статусом `queued`.

### HTTP API (DPS controller)

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/documents/:fileId/prepared` | Статус и результат подготовки |
| `POST` | `/documents/:fileId/prepare` | Явная (повторная) подготовка |

В MVP re-prepare перезаписывает единственную запись на `fileId`. После добавления `variant`/`configHash` — POST принимает опциональный конфиг.

### Отличие от текущего flow

Сейчас: ручной `POST /files-content/:fileId/extract`, синхронно для non-vision.
Цель: автоматически на upload, всё через durable jobs, единый markdown.

---

## Docker / infra для kreuzberg

### Почему Docker, а не native

- `@kreuzberg/node` v5 RC — нестабильно; тяжёлые нативные зависимости.
- Разработка на Windows — Docker изолирует зависимости.
- Версия пиннится тегом образа; сервис масштабируется отдельно.

### Образ

`ghcr.io/kreuzberg-dev/kreuzberg:latest` (**full**, не core) — legacy office `.doc/.ppt/.xls`, `.odt/.rtf`.

### docker-compose.yml

```yaml
  kreuzberg:
    image: ghcr.io/kreuzberg-dev/kreuzberg:latest
    ports:
      - "${KREUZBERG_HOST_PORT:-8000}:8000"
    environment:
      - KREUZBERG_MAX_UPLOAD_SIZE_MB=50
      - RUST_LOG=info
    healthcheck:
      test: ["CMD", "kreuzberg", "--version"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
```

### Операционная оговорка

Прод деплоится PM2 на хосте (в Docker только Postgres). Нужно обеспечить автозапуск kreuzberg-контейнера и учесть в `tools/src/deploy/`.

### Передача файла

Multipart `POST /extract`, байты с диска через `FilesService.getFilePath()`, `output_format=markdown`.

---

## Миграция от `FileContent`

### Таблица форматов

| Домен | Сейчас | Через DPS |
|-------|--------|-----------|
| DOCUMENT `docx` | mammoth → plain text | kreuzberg → markdown |
| DOCUMENT `doc/odt/rtf` | ❌ «не реализовано» | ✅ kreuzberg → markdown |
| SPREADSHEET `xls/xlsx/ods` | SheetJS → CSV-в-тексте | kreuzberg → markdown |
| SPREADSHEET `csv/tsv` | papaparse → markdown | kreuzberg → markdown |
| TEXT `md/txt` | raw utf8 | kreuzberg → markdown |
| VISUAL `pdf/jpg/png` | OCR/LLM → FileContent | LLM Vision → PreparedDocument |

### Стратегия миграции

1. **Параллельная запись** — DPS пишет в `PreparedDocument`, `FileContent` не трогаем (Фазы 1–4).
2. **Переключение читателей** — `ApplicationChunkReader`, `tc-extract` читают `PreparedDocument` (Фаза 5).
3. **Депрекейт** — `files-content/extraction/*` и sync extract endpoints → read-only / удаление (Фаза 6).
4. **Аудит зависимостей** — субагент отделяет extraction deps от report generation deps (Фаза 7).

Старые данные в `FileContent` — по решению: миграция one-off или re-prepare по запросу.

---

## Фазы реализации

### Фаза 0 — Документация и план

- [x] Архитектурный план (`agents/plans/dp.plan.md`).
- [x] Стартовый отчёт (`agents/plans/dp.report.md`).
- Зафиксировать решения, фазы, acceptance criteria.

### Фаза 1 — Инфраструктурный каркас DPS

- Модуль `back-nest/src/document-prepare/` (домен, без `@JobImpl`).
- Prisma model `PreparedDocument` + relation в `File`, migrate.
- `docker-compose.yml`: сервис kreuzberg; env в `.env.example` + `config/env.schema.ts`.
- Порт `DocumentExtractor`, роутер, заглушки адаптеров.
- Базовые сервисы: CRUD `PreparedDocument`, controller (GET/POST).
- Скелетная job `prepare-document` в `jobs/implementations/document-prepare/` (или временные stub jobs — см. reconciliation ниже).
- **Не переключать читателей** — `FileContent` и extraction path без изменений.

**Reconciliation после Фазы 1:** текущая реализация может содержать две stub jobs в `document-prepare/jobs/`. Следующий шаг — привести к одной `prepare-document`, перенести job в `jobs/implementations/document-prepare/`, убрать `@JobImpl` из доменного модуля. См. `.agents/desk/job-patterns.md`.

### Фаза 2 — Kreuzberg integration (non-vision)

- `KreuzbergHttpExtractor`: multipart POST /extract → markdown.
- Tool `kreuzberg.extract.v1` в `prepare-document` (ветка `engine=kreuzberg`).
- Tool `prepare.apply.v1` — запись результата.
- `KreuzbergConcurrencyLimiter` — process-local Semaphore в HTTP-адаптере.
- Health-gating kreuzberg.
- Ручной/тестовый запуск prepare для DOCUMENT/SPREADSHEET/TEXT.

### Фаза 3 — LLM Vision integration (vision/pdf)

- `LlmVisionExtractor`: перенос логики из `scan.shared.ts` / `llm-vision.job.ts`.
- Tools: `vision.render.v1`, `vision.recognize.v1`, `prepare.apply.v1` в `prepare-document` (ветка `engine=llm-vision`).
- Durable `opId` в ToolMemo для submit→poll.
- Все PDF/jpg/png через LLM; OCR не подключаем.

### Фаза 4 — Автоподготовка на upload + backpressure

- Хук в `FilesService.saveUpload` / `OrderApplication` creation.
- `DocumentPrepareService.enqueuePrepare` с роутингом по домену.
- `Swarm` concurrency при батч-загрузке.
- Идемпотентность: повторный upload того же файла не создаёт дублирующий прогон.

### Фаза 5 — Переключение readers на `PreparedDocument`

- `ApplicationChunkReader` (orders) — markdown из `PreparedDocument`.
- `tc-extract.job` — то же.
- Логика порезки на чанки на едином markdown.
- Feature flag или прямое переключение (по решению на старте фазы).

### Фаза 6 — Deprecation `FileContent` extraction

- Убрать синхронное извлечение из `files-content/extraction/*`.
- Deprecate `POST /files-content/:fileId/extract` (read-only период → удаление).
- `FileContent` — read-only / миграция данных / удаление таблицы (по решению).

### Фаза 7 — Dependency audit субагентом

**Обязательный финальный шаг.** Запустить отдельного субагента-аудитора:

1. Найти все импорты пакетов старого extraction path: `mammoth`, `xlsx`/SheetJS, `papaparse`, код в `files-content/extraction/*`.
2. **Отделить** от пакетов для формирования отчётов (`exceljs`, `xlsx` в 1C-отчётах и т.п.) — **их удалять нельзя**.
3. Вернуть два списка:
   - безопасно удалить после миграции;
   - оставить с обоснованием (report generation и др.).
4. Удаление из `package.json` — **только после** отчёта субагента.

---

## Риски и открытые решения

| Риск / вопрос | Комментарий |
|---------------|-------------|
| Kreuzberg SPOF | Health-gating + мониторинг; при необходимости реплики. |
| LLM cost/latency для всех PDF | Осознанное MVP-решение; fast-path для text-layer PDF — позже. |
| Массовая загрузка заявок | `KreuzbergConcurrencyLimiter` (process-local) + `Swarm` для batch enqueue; нагрузочное тестирование в Фазе 4. |
| Форма root job | **Решено:** одна `prepare-document`, engine в input; см. `.agents/desk/job-patterns.md`. |
| Содержимое `meta` | Что сохранять из ответа kreuzberg (tables, tokens) — уточнить в Фазе 2. |
| Миграция исторических `FileContent` | Re-prepare vs one-off SQL — решить перед Фазой 6. |
| Деплой kreuzberg на прод | PM2-хост + Docker только для сервисов; обновить deploy-скрипты. |

---

## Acceptance criteria

### Фаза 1

- [ ] Модуль `document-prepare` зарегистрирован в Nest (домен без `@JobImpl`).
- [ ] `PreparedDocument` в Prisma, миграция применена.
- [ ] kreuzberg в `docker-compose.yml`, env задокументированы.
- [ ] GET/POST эндпоинты отвечают (даже со stub-логикой).
- [ ] Скелетная job `prepare-document` в `jobs/implementations/document-prepare/` (reconciliation с временными stub jobs при необходимости).

### Фаза 2

- [ ] docx/xlsx/csv/md успешно → markdown через `prepare-document` (`engine=kreuzberg`).
- [ ] Process-local concurrency limit работает (не более `DPS_MAX_CONCURRENCY` параллельных HTTP к kreuzberg).
- [ ] Health check отражает состояние kreuzberg.

### Фаза 3

- [ ] pdf/jpg/png → markdown через `prepare-document` (`engine=llm-vision`).
- [ ] Durable recovery после рестарта для незавершённого recognize.

### Фаза 4

- [ ] Upload автоматически ставит prepare job.
- [ ] Массовая загрузка не валит kreuzberg (backpressure).

### Фаза 5

- [ ] Orders и tc-extract читают `PreparedDocument`, не `FileContent`.
- [ ] Существующие сценарии анализа работают на markdown.

### Фаза 6

- [ ] Sync extraction path удалён или deprecated.
- [ ] Нет новых записей в `FileContent` из DPS-flow.

### Фаза 7

- [ ] Отчёт субагента-аудитора с двумя списками зависимостей.
- [ ] Безопасные extraction-deps удалены из `package.json`.

### Общие

- [ ] Все джобы в стиле jobs-with-tools (tools, не child JobRun для extract/apply/recognize).
- [ ] Документация на русском обновлена при изменении кода.
- [ ] `pnpm lint-fix`, `pnpm check`, тесты по затронутым модулям проходят.

---

## Документация проекта

Проект документируется на русском. При реализации каждой фазы обновлять:

- `.agents/plans/dp.report.md` — журнал изменений.
- `.agents/desk/` — справочные паттерны для implementer-субагентов (`effect-patterns.md`, `job-patterns.md`).
- README модуля `document-prepare` (по аналогии с существующими).
- `.env.example` и env schema при добавлении переменных.

Перед запуском implementer-субагентов предоставлять паттерны из `.agents/desk/`.
