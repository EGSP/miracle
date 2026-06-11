# План: Document Prepare Service (DPS)

Независимый домен внутри `back-nest` для подготовки документов: «файл → markdown». Комбайн, который не знает про orders/TC/отчёты — он только готовит унифицированный markdown, а потребители (анализ заказов, извлечение ТУ, вычитки в джобах) читают результат.

---

## 0. Контекст и вердикт

### Что уже есть в miracle

- **Извлечение «чистых» форматов** живёт синхронно прямо в HTTP-запросе (`back-nest/src/files-content/extraction/*`): docx → mammoth (**plain text**), xlsx → SheetJS (**CSV-в-тексте**), csv/tsv → papaparse (markdown), md/txt → raw utf8. Форматы `doc/odt/rtf` бросают «Не реализовано: LibreOffice».
- **Извлечение VISION** (pdf/jpg/png) уже асинхронное и durable — джобы `ocr` / `llm-vision` / `llm-vision-tc` поверх собственного Effect-движка джоб.
- **Результат** пишется в `FileContent` (`back-nest/prisma/schema.prisma`), у которого нет Prisma-relation к `File`, а формат выхода разнородный.
- **Очередь джоб** — собственный durable-движок на PostgreSQL (`JobRun`, идемпотентность по `keyHash`, восстановление в `onApplicationBootstrap`, in-process Effect-фиберы). **Redis/BullMQ нет и не нужно.**
- **ConvertService** (`back-nest/src/convert/`) уже умеет PDF → JPEG (pdfjs + canvas) — переиспользуем для LLM-vision.

### Вердикт

Отдельный DPS — правильное решение. Он унифицирует выход в **markdown** и делает подготовку единым асинхронным durable-конвейером (вместо «иногда синхронно в реквесте, иногда джобой»). Это не костыли поверх `FileContent`, а нормальный домен.

### Зафиксированные решения

1. **Движок kreuzberg — внешний Docker REST-сервис** (`ghcr.io/kreuzberg-dev/kreuzberg`), не native-биндинг.
2. **OCR не используем.** Все файлы `VISION`-домена (pdf/jpg/png) идут в **LLM** (PDF — постранично как картинки через ConvertService, картинки — как есть). kreuzberg для VISION не используется.
3. **Всё, что НЕ vision → kreuzberg** (docx, doc, odt, rtf, xls, xlsx, ods, csv, tsv, md, txt, html и пр.).
4. **Новая модель `PreparedDocument`**; `FileContent` депрекейтим постепенно по фазам.
5. **Автоподготовка на upload** с лимитами очереди, чтобы не перегрузить kreuzberg.
6. **Все PDF → LLM** на старте. Иной вариант (цифровой PDF с текстовым слоем → kreuzberg) добавим позже — порт это позволит без переделок.

---

## 1. Движок: Docker REST-сервис

### Почему Docker, а не `@kreuzberg/node`

- Native TS-биндинг сейчас **v5 RC** — нестабильно для прода; тянет тяжёлые нативные зависимости (PDFium, Tesseract, Pandoc). Дев на **Windows** — на хосте это боль. Docker всё изолирует.
- Версия пиннится тегом образа; апгрейд kreuzberg не ломает сборку бэка.
- Сервис языко-независим, масштабируется отдельно (можно поднять реплики при упоре в throughput).
- Ставится рядом с Postgres в тот же `docker-compose.yml`.

### Операционная оговорка (важно для прода)

Прод сейчас деплоится **PM2 на хосте**, без контейнера приложения (в Docker только Postgres). Значит на проде тоже нужно держать запущенным kreuzberg-контейнер: добавить сервис в `docker-compose.yml` и обеспечить автозапуск. Это единственная новая операционная зависимость — учесть в деплой-скрипте (`tools/src/deploy/`).

### Образ

Берём **`full`** (`ghcr.io/kreuzberg-dev/kreuzberg:latest`), а не `core`: full нативно парсит legacy office `.doc/.ppt/.xls` + `.odt/.rtf`. То есть **kreuzberg закрывает ровно те форматы, что сейчас бросают «Не реализовано»** — это плюс к функционалу, а не только рефакторинг.

### Compose-добавка

```yaml
  kreuzberg:
    image: ghcr.io/kreuzberg-dev/kreuzberg:latest   # full: legacy office + markdown
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

Новые env (добавить в `.env.example` и `config/env.schema.ts`):
- `KREUZBERG_URL` (например `http://localhost:8000`) — базовый URL сервиса для адаптера.
- `KREUZBERG_HOST_PORT` — порт публикации контейнера.
- `DPS_MAX_CONCURRENCY` — лимит одновременных запросов к kreuzberg со стороны бэка (см. п.6).

### Как передаём файл

Multipart `POST /extract` (читаем байты с диска через `FilesService.getFilePath()`), с `output_format=markdown`. Path-режим (CLI/MCP) не используем — REST-эндпоинт работает с multipart. При лимите 50 МБ это нормально.

---

## 2. Что меняется по форматам

| Домен (`types/src/file-types.ts`) | Сейчас | Через DPS |
|---|---|---|
| DOCUMENT `docx` | mammoth → **plain text** | kreuzberg → **markdown** |
| DOCUMENT `doc/odt/rtf` | ❌ throw «не реализовано» | ✅ kreuzberg (full image) → markdown |
| SPREADSHEET `xls/xlsx/ods` | SheetJS → CSV-в-тексте | kreuzberg → markdown-таблицы |
| SPREADSHEET `csv/tsv` | papaparse → markdown | kreuzberg → markdown |
| TEXT `md/txt` | raw utf8 | kreuzberg → markdown |
| VISION `pdf/jpg/png` | OCR/LLM Yandex | **LLM-vision** (по решению; OCR убираем из пути DPS) |

Главный выигрыш — **единый markdown** на выходе: порезка на чанки, токенайзер, LLM-вычитки работают по одному формату.

---

## 3. Граница домена DPS (порт + адаптеры)

Новый модуль `back-nest/src/document-prepare/` (dps). Не знает про orders/TC/отчёты. Внутри — порт и роутер стратегий.

```
back-nest/src/document-prepare/
  document-prepare.module.ts
  document-prepare.service.ts        // CRUD PreparedDocument + постановка джоб
  document-prepare.controller.ts     // GET статус/результат, POST повторная подготовка
  extractor.port.ts                  // интерфейс DocumentExtractor
  router.ts                          // выбор адаптера по FileDomain
  adapters/
    kreuzberg-http.extractor.ts      // POST multipart → kreuzberg, output_format=markdown
    llm-vision.extractor.ts          // ConvertService (pdf→jpg) + LLM; перенос логики scan.shared.ts
  dto/*.ts
```

Порт:

```ts
interface DocumentExtractor {
  readonly engine: 'kreuzberg' | 'llm-vision';
  extract(file: FileModel, path: string, config: PrepareConfig): Effect.Effect<PreparedResult, ExtractError, ...>;
}
```

Роутер по `FileDomain`:
- `DOCUMENT | SPREADSHEET | TEXT` → `KreuzbergHttpExtractor`
- `VISUAL` (pdf/jpg/png) → `LlmVisionExtractor`

Движок спрятан за портом: завтра захотим native-биндинг или цифровой-PDF-fast-path — меняется один адаптер/одна ветка роутера, конвейер и модель данных не трогаются.

---

## 4. Модель данных `PreparedDocument`

### Ответ на примечание про `configHash` / `version` и A/B

Поля не переусложнение — это **ровно тот механизм, который потом позволит параллельные вычитки / A/B без миграции схемы**. Идея:

- В обычном режиме на файл = **одна** запись на каждую конфигурацию подготовки (идемпотентность по `configHash`: повтор с тем же конфигом не пересчитывает).
- Для **A/B**: запускаем подготовку того же файла с N разными конфигами (другой движок / другая модель / другой промпт) → получаем **N записей `succeeded` на один `fileId`**, каждая со своим `configHash` и человекочитаемым `label`. Потребитель (анализ, вычитка) выбирает вариант. Никаких изменений схемы для этого не понадобится — поэтому закладываем сразу.

То есть: **да, A/B и несколько параллельных вычиток на основе этих полей возможны.** `configHash` = идентичность варианта + дедуп; `label` = удобная метка варианта. От `version` как отдельного счётчика отказываемся (его роль закрывают «несколько строк + `configHash` + `createdAt`-порядок»), чтобы не плодить лишнее.

### Схема (Prisma)

```prisma
enum PrepareStatus {
  queued
  running
  succeeded
  failed
}

model PreparedDocument {
  id         String        @id @default(uuid())
  file       File          @relation(fields: [fileId], references: [id])
  fileId     String
  status     PrepareStatus
  engine     String        // 'kreuzberg' | 'llm-vision'
  config     Json?         // фактические параметры подготовки (модель, промпт, опции kreuzberg)
  configHash String        // канонический хэш(engine + config) — идемпотентность + идентичность A/B-варианта
  label      String?       // опц. метка варианта: 'baseline', 'gpt-prompt-v2' и т.п.
  markdown   String?       // унифицированный выход
  pages      Json?         // [{ page, markdown }] для постраничных (vision/pdf)
  meta       Json?         // metadata / tables / detectedMime / tokens / engineVersion
  error      String?
  jobRunId   String?       // связь с JobRun
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  deletedAt  DateTime?

  @@index([fileId])
  @@index([status])
  @@index([fileId, configHash])
}
```

`File` получает обратную relation `preparedDocuments PreparedDocument[]` (в отличие от текущего «висящего» `FileContent.fileId` без relation).

`configHash` считаем тем же `hashKey()` из `back-nest/src/jobs/framework/hash-key.ts` (канонический JSON-хэш в стиле TanStack Query) — переиспользуем, не пишем своё.

---

## 5. Очередь и схема корневой джобы (с учётом переезда на jobs-with-tools)

Переиспользуем существующий durable job-движок на Postgres. **Redis/BullMQ не вводим.**

### Учёт нового стиля джоб (JobTool вместо россыпи подджоб)

Идёт переезд джоб на **`JobTool`** (`back-nest/src/jobs/framework/job-tool.ts` + `context.ts`): typed-операция исполняется **внутри одного `JobRun`**, durable-память пишется в `memo.tool_calls[keyHash]`, **без создания дочернего узла дерева**. Поэтому схема DPS-джоб отличается от «recognize/apply как отдельные child-jobs»:

- **`kreuzberg`-джоба и `llm-vision`-джоба остаются** как джобы (две стратегии).
- Шаги `extract` / `recognize` / `apply` становятся **тулами внутри этих джоб** (`JobTools.run(...)`), а не отдельными подджобами.
- `recognize`/LLM-тул хранит `opId` в своей tool-memo (durable до начала поллинга) — переносим из `common/cloud-job.ts` логику submit/poll внутрь тула.

Концептуальное дерево:

```
prepare-document (root, key: ['prepare-document', fileId, configHash])
└── по FileDomain → одна из двух джоб:
    ├── kreuzberg-extract (job)
    │     tools: kreuzberg.extract.v1 (HTTP multipart → markdown)
    │            prepare.apply.v1     (запись PreparedDocument: succeeded/failed)
    └── llm-vision-extract (job)
          tools: vision.render.v1     (ConvertService: pdf→jpg / image as-is)
                 vision.recognize.v1  (LLM, opId в tool-memo, submit→poll)
                 prepare.apply.v1     (запись PreparedDocument: succeeded/failed)
```

> Примечание: при необходимости `prepare-document` может быть не отдельным оркестратором, а тонким диспетчером, который сразу запускает нужную из двух джоб. Финальную форму (один root-оркестратор vs прямой запуск стратегии) согласовать на этапе реализации Фазы 1 — обе совместимы с tools-подходом. Тулы `extract`/`apply` версионируем в `type` (`...v1`), чтобы смена промпта/алгоритма заводила новый durable-слот.

### Идемпотентность

`keyHash(['prepare-document', fileId, configHash])`. Повторный запрос с теми же параметрами вернёт тот же `JobRun` (не пересчитывает). Re-prepare или A/B = другой `configHash` → новый прогон и новая запись `PreparedDocument`.

### Восстановление

Durable-логика LLM-vision (memo `opId` до поллинга) переносится в `vision.recognize`-тул. После рестарта незавершённые root-джобы поднимаются штатно (`onApplicationBootstrap`).

### Health-gating

Добавить проверку kreuzberg (`GET` версии/healthcheck контейнера) в `HealthModule`, чтобы `kreuzberg.extract`-тул не висел на мёртвом сервисе и быстро падал в `failed` с понятной ошибкой.

---

## 6. Автоподготовка на upload + лимиты очереди

### Триггер

В отличие от текущего ручного `POST /files-content/:fileId/extract`, DPS-комбайн ставит подготовку **автоматически при загрузке файла** (`FilesService.saveUpload` / транзакция создания `OrderApplication`). Плюс явный эндпоинт `POST /documents/:fileId/prepare` (для re-prepare и A/B с явным конфигом).

### Лимиты, чтобы не перегрузить kreuzberg

Существующий `runFanout` гоняет `Effect.all` с `concurrency: 'unbounded'` — при массовой загрузке это завалит один kreuzberg-контейнер. Решения (DPS станет первым реальным потребителем `Swarm`):

1. **Глобальный лимит запросов к kreuzberg** — общий семафор/`Swarm.run(..., { concurrency: DPS_MAX_CONCURRENCY })` на стороне адаптера (например 4–8 одновременно). Это потолок именно на HTTP-запросы к kreuzberg, а не на число джоб.
2. **Батч-постановка**: при массовой загрузке (например, файлы заявок заказа) ставить подготовку через `Swarm.run(files, prepareOne, { label, failureMode: 'partial', concurrency: DPS_MAX_CONCURRENCY })`.
3. **На стороне контейнера**: `KREUZBERG_MAX_UPLOAD_SIZE_MB=50` + (при необходимости) реплики kreuzberg.

LLM-vision лимитируется отдельно — у него уже есть свой rate-limiter в `YandexService` (Effect `RateLimiter`); не смешивать с лимитом kreuzberg.

---

## 7. PDF: на старте всё в LLM

Сейчас весь `VISION` (включая **любые** PDF) идёт в LLM. Это осознанное решение. На будущее (без переделки порта) можно добавить ветку: «PDF с текстовым слоем → kreuzberg (дёшево/быстро/точно), скан/картинка → LLM». kreuzberg сам умеет различать text-layer vs скан. Это просто доп. условие в `router.ts` — закладываем точку расширения, но **не реализуем сейчас**.

---

## 8. Фазы внедрения (без ломки)

### Фаза 1 — построить DPS параллельно

- Модуль `back-nest/src/document-prepare/`, модель `PreparedDocument` (+ relation в `File`), prisma migrate.
- Порт `DocumentExtractor` + роутер + два адаптера (`kreuzberg-http`, `llm-vision`).
- Джобы `kreuzberg-extract` / `llm-vision-extract` в tools-стиле; регистрация в `job-implementations.module.ts`.
- `kreuzberg` в `docker-compose.yml`, env в `.env.example` + `config/env.schema.ts`.
- Автопостановка на upload + лимиты (`Swarm` concurrency, `DPS_MAX_CONCURRENCY`).
- Health-gating kreuzberg.
- Пишем в новую таблицу; `FileContent` и `files-content/extraction/*` **не трогаем**.

### Фаза 2 — переключить читателей

- `ApplicationChunkReader` (orders) и `tc-extract` читают `PreparedDocument` вместо `FileContent`.
- Логика порезки на чанки переезжает на markdown из `PreparedDocument`.

### Фаза 3 — депрекейт

- Убрать синхронное извлечение из `files-content/extraction/*`.
- `FileContent` → read-only, затем (по решению) миграция данных и удаление.

---

## 9. Зачистка зависимостей — обязательный финальный шаг

После Фаз 2–3 **запустить суб-агента**, который пройдётся по проекту и проверит, остались ли зависимости от пакетов извлечения, которые DPS заменяет:

- `mammoth` (docx),
- `xlsx` / SheetJS (spreadsheets),
- `papaparse` (csv/tsv),
- остатки путей `files-content/extraction/*`.

**Важно:** часть пакетов нужна НЕ для извлечения, а для **формирования отчётов** (например `exceljs` в генерации 1C-отчётов) — это нормально и удаляться **не должно**. Суб-агент должен:
1. найти все импорты этих пакетов и места использования;
2. отделить «извлечение документов» (можно удалять после миграции читателей) от «формирование отчётов» (оставить);
3. вернуть список безопасных к удалению зависимостей и список «оставить, используется отчётами» с обоснованием.

Только после отчёта суб-агента удалять пакеты из `back-nest/package.json`.

---

## 10. Открытые детали реализации (согласовать в начале Фазы 1)

- Форма root-джобы: единый оркестратор `prepare-document` vs прямой запуск стратегии-джобы по домену (обе совместимы с tools).
- Содержимое `config` (минимум: `engine`, для LLM — `model`/`prompt`-id, для kreuzberg — опции `/extract`).
- `meta`: что именно сохраняем из ответа kreuzberg (tables, metadata, detectedMime, tokens).
- Нужен ли DPS-эндпоинт листинга вариантов для A/B уже в Фазе 1 или позже.

---

## Документация (правило проекта)

Проект документируется на русском; при изменении кода обновлять соответствующую документацию. Для DPS завести раздел в доках (по аналогии с существующими README), описывающий домен, контракт `PreparedDocument`, движки и очередь.
