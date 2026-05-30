# Миграция бэкенда на NestJS — база знаний

> Этот каталог — единый источник правды для агентов, которые мигрируют код из `back/` (Express + кастомный typed-routing) в `back-nest/` (NestJS).
> Каждый документ самодостаточен — агент может читать только то, что нужно для его задачи.

---

## Зачем переезжаем

В проекте сейчас работает `back/` — Express с собственным фреймворком над ним (`back/src/app/router.ts`, ~310 строк) и собственным генератором парсеров (`back/src/app/generated/parsers.generated.ts`, ~860 строк). Это даёт хорошую эргономику, но:

- ~1200 строк собственного кода во фреймворке — bus-factor 1
- `body` запросов **не валидируется** в runtime (только `query`/`params`)
- нет готовой инфраструктуры под очереди, воркеры, websockets, SSE, scheduled jobs
- нет нормального DI — `locals: Record<string, unknown>` тип-небезопасен

Цель миграции — Nest как зрелый фреймворк со всей экосистемой, при сохранении уже принятых решений (jose для JWT, zod для схем, JsonCollection как БД).

## Целевая архитектура

| Слой | Решение |
|---|---|
| HTTP-фреймворк | **NestJS** |
| HTTP-адаптер | **Fastify** (`@nestjs/platform-fastify`) |
| Валидация входов | **`nestjs-zod`** — одна zod-схема → TS-тип + runtime + (позже) OpenAPI |
| JWT | **`jose`** (как в текущем `back`) |
| База данных | **скопированная** `JsonCollection` из `back/src/databases/db.ts` (миграция на Drizzle/Postgres — отдельная фаза позже) |
| Объявление коллекций | **отделено** от сервисов: централизованно в `back-nest/src/database/collections.ts` |
| Формат ошибок | стандартный `HttpException` Nest (формат `err.*` старого `back` **не** реплицируем) |
| Документация | **русский язык** (см. AGENTS.MD проекта) |

## Что НЕ делаем в текущей фазе

Эти пункты явно отложены и **не должны** появляться в коде `back-nest`:

- Миграция БД на Drizzle/Postgres — JSON-файлы остаются как есть.
- Кодген клиента под Nest — фронт пока работает с прошлым API; кодген появится позже.
- Очереди `@nestjs/bull` — **не вводим**. Существующий `worker-pool` переезжает как есть (worker-runtime + воркеры по доменам, см. `lib.md`), на bull не переписываем.
- Дополнительные guards по ролям (`AdminGuard` и т.п.) — по мере миграции `admin.router.ts`.
- CI/CD, Docker, PM2-конфигурация — отдельный разговор.
- Тесты — пишем после первой партии миграций.

## Карта документов

Этот каталог содержит:

| Документ | Когда читать |
|---|---|
| `README.md` (этот файл) | Первым делом — общая картина |
| `bootstrap.md` | Если задача — впервые поднять `back-nest` |
| `module.md` | При создании любого нового доменного модуля |
| `controller.md` | При переносе любого `*.router.ts` |
| `service.md` | При выделении бизнес-логики из старого роутера |
| `dto.md` | При описании DTO для request body / query / params |
| `database.md` | При добавлении новой коллекции или работе с существующей |
| `auth.md` | Если эндпоинт требует аутентификации |
| `errors.md` | При замене `err.*` из старого кода на исключения Nest |
| `lib.md` | Если исходник импортирует из `back/src/lib/` или `back/src/logger/` — куда такие файлы переезжают и что отложено |
| `client-generator.md` | Если задача — написать новый генератор клиента (`tools/src/client-generator-nest/`) под NestJS |

### Что читать под конкретную задачу

- **«Перенеси `<x>.router.ts` в Nest»** → `controller.md` + `service.md` + `dto.md` + `errors.md` (+ `auth.md` если есть `authMiddleware` + `database.md` если нужны новые коллекции + `lib.md` если есть импорты из `back/src/lib/` или `back/src/logger/`).
- **«Поднимай каркас `back-nest` с нуля»** → `bootstrap.md`.
- **«Добавь новый домен <foo>»** → `module.md` + остальные по нужде.
- **«Подними логгер в `back-nest`»** → `lib.md` (секция «Логгер»).
- **«Напиши генератор клиента для `back-nest`»** → `client-generator.md`.
- **«Подключи новую БД-сущность»** → `database.md`.

## Канонический пример

В `back-nest/src/users/` лежит **полностью реализованный демо-домен**, на который ссылаются все паттерн-документы. Если возник вопрос «как должен выглядеть мой код» — смотри туда:

- `back-nest/src/users/users.module.ts` — структура модуля
- `back-nest/src/users/users.controller.ts` — контроллер с `AuthGuard` + `@CurrentUser`
- `back-nest/src/users/users.service.ts` — сервис через `DatabaseService`, возвращает `Stored<User>`

У `users/` **нет** каталога `dto/`: входных эндпоинтов пока нет, а response — TS-тип из `@miracle/types`, без обёртки `createZodDto` (см. `dto.md`). Первый пример DTO появится при миграции `orders`.

Этот домен **обязан** оставаться эталонным. Если паттерн меняется — сначала обнови `users/`, потом паттерн-документ.

## Порядок миграции маршрутов

Порядок определяется **топологией зависимостей** (DI-граф + общие коллекции + инфраструктура), а не субъективной «сложностью». Тестирование идёт сразу на полной версии, поэтому деления «сначала проверим каркас на простом, потом возьмём жирное» нет. Единственное жёсткое правило: **домен нельзя брать раньше всего, что он инжектит и запускает**.

### Инфраструктурные шаги (вне доменов)

Это предпосылки, а не маршруты. Делаются как только нужны первому потребителю:

- **Логгер** — `@Global` `LoggerModule` (`AppLoggerService`) **сделан** в слое 3 (`back-nest/src/logger/`, `app.useLogger` в `main.ts`). Канонический пример инжекта — `files-content/extraction/extraction.service.ts`. См. `lib.md`, секция «Логгер».
- **Роль-гард** — вариант `AuthGuard` под роли (замена `adminRoleMiddleware`) — перед `admin`. **Сделано** (`AdminGuard`, слой 2).
- **Multipart** — `@fastify/multipart` — перед `files`. **Сделано** (слой 2).
- **Вендорные `@Global`-модули** — `yandex/` (`YandexService`), `convert/` (pdf→image). Их единственные потребители — scan-воркеры VISUAL-извлечения (worker-runtime), поэтому создаются в **слое 4** вместе с этими воркерами, не раньше (в слое 3 были бы мёртвым кодом). См. `lib.md`.
- **Worker-runtime** — `worker-pool` + `base-worker` — перед первым доменом, запускающим воркеры (`technical-conditions`, `orders`). Конкретные воркеры едут по доменам (см. `lib.md`), а не отдельной «фазой очередей».

### Маршруты — по слоям зависимостей

**Слой 0 (сделано):** `health` → `sessions` → `auth`.

**Слой 1 — только своя коллекция, без чужих сервисов:**
1. `user.router.ts` → `user/` — тривиальный, без auth.
2. `product-type.router.ts` → `product-types/` — CRUD + auth.
3. `workers.router.ts` → `workers/` — управляющий CRUD над `workersService`. Эндпоинты `GET /`, `DELETE /:id`, `GET /:id/preview-prompt` **не зависят** от исполнения воркеров (worker-runtime здесь не нужен), поэтому едут рано, а не «в фазе очередей». **Исключение:** `POST /:id/apply-worker-data` вызывает `workerPool.applyByWorkerId`, который инстанцирует все конкретные классы воркеров и зовёт `apply()` — это тянет worker-runtime + домены `orders`/`technical-conditions`/извлечение. Поэтому этот **один** эндпоинт отложен до слоя 4 (вместе с worker-runtime), а в слое 1 переезжает только управляющий CRUD.

**Слой 2 (сделано) — одна инфра-зависимость:**
4. `admin.router.ts` → **свёрнут в `users/`**: отдельный admin-модуль не делали (был чистый pass-through к `UsersService`). Эндпоинты переехали на `UsersController` как `GET /users` и `POST /users` под `@UseGuards(AuthGuard, AdminGuard)` (роль-гард на уровне метода). Схема — `CreateUserSchema` в `users.schemas.ts`. **Изменение путей:** `/admin/users` → `/users` (фронт правится позже).
5. `file.router.ts` → `files/` — нужен multipart (`@fastify/multipart` через `req.file()`; multer заменён). Range-стриминг контента через `@Res() FastifyReply`; mkdir uploads + fix-кодировки имён на `OnApplicationBootstrap`.

**Слой 3 (сделано) — извлечение контента:**
6. `file-content.router.ts` → `files-content/`. Зависит от `files` (контент привязан к файлу). Внутри домена **два сервиса**: `FilesContentService` (персистентность коллекции `file-content`: create/get/getContent/softDelete/update/tokens) и `ExtractionService` (оркестрация извлечения; инжектит `FilesService` + `FilesContentService`). `countTokens` — локальный чистый helper (`count-tokens.ts`). Generator-экстракторы doc/spreadsheet/text — чистые функции в каталоге домена. **Отложено на слой 4:** VISUAL-извлечение (OCR / LLM Vision / TC-LLM) — оно запускает scan-воркеры через worker-runtime; `yandex`/`convert` нужны **только** этим воркерам, поэтому в слое 3 их **не создаём** (был бы мёртвый код). До слоя 4 `ExtractionService` для VISUAL-файлов бросает `NotImplementedException`. Visual-методы добавятся прямо в `ExtractionService`, `FilesContentService` при этом не трогается.

**Слой 4 — вершина DI-стека:**
7. `technical-condition.router.ts` → `technical-conditions/` — инжектит `productTypesService`; эндпоинт `extract-details` запускает `TCDetailsWorker` (едет в этот домен) поверх worker-runtime и извлечения. Зависит от `files`/извлечения.
8. `order.router.ts` → `orders/` — **последний**. Инжектит `FilesService` + `TechnicalConditionsService`, запускает `DesignationWorker` (едет в этот домен). Зависит от `files` + `technical-conditions` + worker-runtime. Доменная утилита `resolve-product-type` едет сюда же.

> Заметь: в старом коде `order` и `technical-condition` **не** «без файлов/воркеров» — оба импортируют `workerPool` и конкретные воркеры, `order` ещё и `filesService`. Поэтому они стоят в конце, а не в середине.

## Где живут данные

`back-nest` использует ту же `JsonCollection` (скопирована из `back`), но **директория данных параметризована**:

- если задана env-переменная `DB_DIR` — используется она (абсолютный путь или относительный к cwd);
- иначе — `back-nest/data/`.

**Для cutover** с `back` на `back-nest` есть два пути (операционное решение, не часть кода):
- скопировать `back/data/*` в `back-nest/data/` перед первым запуском;
- либо установить `DB_DIR=./back/data` в `.env`.

Параллельная работа двух процессов на одной директории **запрещена** — JsonCollection не атомарна между процессами.

## Принципы кода в `back-nest`

Эти правила обязательны для всех агентов:

1. **Один домен — один модуль** (`back-nest/src/<domain>/`). Никаких «общих» сервисов вне модулей, кроме `database/`, `config/`, `auth/`, `tokens/`.
2. **Сервис не создаёт `JsonCollection`** — это делает `database/collections.ts` централизованно. Сервис инжектит `DatabaseService` и работает через `this.db.collections.<name>`.
3. **Контроллер не содержит бизнес-логики** — только парсинг запроса, вызов сервиса, возврат ответа. Любое условие/проверка/мутация → в сервис.
4. **Input всегда через DTO** (`createZodDto`). Никаких inline-типов в сигнатуре `@Body() dto: { foo: string }`.
5. **Output — TS-тип** (обычно из `@miracle/types`). Runtime-валидация ответа не нужна.
6. **Ошибки — throw `*Exception`**, а не `return err.*`. См. `errors.md`.
7. **Импорты внутри пакета — относительные с `.js`-суффиксом** (NodeNext-ESM): `import { X } from './foo.js'`. Импорты из workspace-пакетов — без суффикса: `import { User } from '@miracle/types'`.
8. **Имена файлов — kebab-case с суффиксом роли**: `users.controller.ts`, `users.service.ts`, `users.module.ts`, `create-order.dto.ts`, `auth.guard.ts`, `current-user.decorator.ts`.
9. **Имена классов — PascalCase с тем же суффиксом**: `UsersController`, `UsersService`, `UsersModule`, `CreateOrderDto`, `AuthGuard`.
10. **Комментарии — на русском**, только когда объясняют **почему**, а не **что**. Если код самоочевиден — без комментариев.
