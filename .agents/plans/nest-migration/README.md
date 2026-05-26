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
- Очереди / `@nestjs/bull` — `workers/` остаются на текущей реализации.
- Полный auth-флоу (login/logout/register/refresh) — мигрируется как обычный домен позже; сейчас в каркасе только `AuthGuard` для уже выданных токенов.
- Multipart-загрузки (`@fastify/multipart`) — отдельная фаза.
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

### Что читать под конкретную задачу

- **«Перенеси `<x>.router.ts` в Nest»** → `controller.md` + `service.md` + `dto.md` + `errors.md` (+ `auth.md` если есть `authMiddleware` + `database.md` если нужны новые коллекции).
- **«Поднимай каркас `back-nest` с нуля»** → `bootstrap.md`.
- **«Добавь новый домен <foo>»** → `module.md` + остальные по нужде.
- **«Подключи новую БД-сущность»** → `database.md`.

## Канонический пример

В `back-nest/src/users/` лежит **полностью реализованный демо-домен**, на который ссылаются все паттерн-документы. Если возник вопрос «как должен выглядеть мой код» — смотри туда:

- `back-nest/src/users/users.module.ts` — структура модуля
- `back-nest/src/users/users.controller.ts` — контроллер с `AuthGuard` + `@CurrentUser`
- `back-nest/src/users/users.service.ts` — сервис через `DatabaseService`
- `back-nest/src/users/dto/public-user.dto.ts` — DTO через `createZodDto`

Этот домен **обязан** оставаться эталонным. Если паттерн меняется — сначала обнови `users/`, потом паттерн-документ.

## Порядок миграции маршрутов

Старые роутеры в `back/src/routers/` переезжают **от простых к сложным**:

1. `health.router.ts` (тривиально, но обкатает каркас)
2. `session.router.ts` (минимальный, auth есть)
3. `user.router.ts` (тривиальный, без auth)
4. `product-type.router.ts` (простой CRUD)
5. `technical-condition.router.ts` (средний CRUD)
6. `order.router.ts` (большой, но без файлов/воркеров)
7. `auth.router.ts` (login/logout/register/refresh — нужна работа с cookies)
8. `admin.router.ts`
9. `file.router.ts` + `file-content.router.ts` — **отложено** до фазы multipart
10. `workers.router.ts` — **отложено** до фазы очередей

Перед переездом «жирных» роутеров (`file`, `workers`) каркас должен быть проверен на простых.

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

1. **Один домен — один модуль** (`back-nest/src/<domain>/`). Никаких «общих» сервисов вне модулей, кроме `database/`, `config/`, `auth/`.
2. **Сервис не создаёт `JsonCollection`** — это делает `database/collections.ts` централизованно. Сервис инжектит `DatabaseService` и работает через `this.db.collections.<name>`.
3. **Контроллер не содержит бизнес-логики** — только парсинг запроса, вызов сервиса, возврат ответа. Любое условие/проверка/мутация → в сервис.
4. **Input всегда через DTO** (`createZodDto`). Никаких inline-типов в сигнатуре `@Body() dto: { foo: string }`.
5. **Output — TS-тип** (обычно из `@miracle/types`). Runtime-валидация ответа не нужна.
6. **Ошибки — throw `*Exception`**, а не `return err.*`. См. `errors.md`.
7. **Импорты внутри пакета — относительные с `.js`-суффиксом** (NodeNext-ESM): `import { X } from './foo.js'`. Импорты из workspace-пакетов — без суффикса: `import { User } from '@miracle/types'`.
8. **Имена файлов — kebab-case с суффиксом роли**: `users.controller.ts`, `users.service.ts`, `users.module.ts`, `public-user.dto.ts`, `auth.guard.ts`, `current-user.decorator.ts`.
9. **Имена классов — PascalCase с тем же суффиксом**: `UsersController`, `UsersService`, `UsersModule`, `PublicUserDto`, `AuthGuard`.
10. **Комментарии — на русском**, только когда объясняют **почему**, а не **что**. Если код самоочевиден — без комментариев.
