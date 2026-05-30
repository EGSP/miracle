# Паттерн: куда переносить код из `back/src/lib/` и `back/src/logger/`

## Когда применять

При переносе любого домена в `back-nest/` ты увидишь импорты вида `from '../../lib/<...>'` или `from '../../logger/logger.js'` в исходных файлах `back/`. Этот документ описывает, **куда** каждый такой файл переезжает и **в какую фазу** его трогать.

## Главное правило одной фразой

> Общего каталога `lib/` или `common/` в `back-nest/` мы **не воссоздаём**. Каждый файл из `back/src/lib/` едет в место, которое определяется его природой зависимостей.

Это сознательное отступление от структуры старого `back/`. В Nest «общий код» — антипаттерн, пока он не реально общий: естественное место для функции — каталог её домена-потребителя.

## Решение (2026-05-29): весь `lib/` едет по доменам, кроме вендорных SDK

Принято: **функционал из `back/src/lib/` переносится в домены-потребители**, включая worker-only хелперы и конкретные воркеры. Отдельной «фазы воркеров/очередей» как поздней стадии **нет** — воркер едет вместе с доменом, который его запускает (`DesignationWorker` → `orders/`, `TCDetailsWorker` → `technical-conditions/`, `extraction/*` → `files-content/`).

**Единственное исключение — внешние SDK-обёртки**, которые являются stateful-singleton'ами и реально нужны нескольким доменам: они остаются отдельными `@Global`-модулями.

- `lib/yandex/*` → `back-nest/src/yandex/` — `@Global` `YandexService` (Session/токен — один на процесс).
- `lib/convert/*` (pdfjs) → `back-nest/src/convert/` — `@Global` сервис.

Эти вендор-модули **не откладываются абстрактно**, а создаются вместе с первым доменом-потребителем (извлечение контента в `files-content/`) и инжектятся в доменные сервисы/воркеры через DI.

Так же отдельным `@Global`-модулем остаётся **логгер** (это инфраструктура, не вендор — см. секцию «Логгер»). Сам `worker-pool`/`base-worker` — это worker-runtime, общий для `orders` и `technical-conditions`; он мигрируется инфра-шагом перед первым доменом с воркерами (правило 5 «общий код»), тогда как **конкретные** воркеры — по доменам.

## Категории и адреса

Перед переносом классифицируй файл по тому, **что он импортирует** и **кто его зовёт**:

| Природа | Признак | Куда в `back-nest/` | Когда |
|---|---|---|---|
| Доменная утилита | импортирует доменный сервис/коллекцию (`productTypesService`, `userDb`, …) | внутрь каталога домена-потребителя — отдельным файлом или приватным методом сервиса | вместе с миграцией этого домена |
| Чистая функция над `@miracle/types` | импортирует только из `@miracle/types` или без зависимостей | приватный helper в каталоге первого потребителя | вместе с первым потребителем |
| Внешний API/SDK | импортирует `@yandex-cloud/...`, `pdfjs-dist`, прочих вендоров | отдельный `@Global()`-модуль `back-nest/src/<vendor>/` с `<Vendor>Service` (env через `AppConfigService`) | вместе с первым доменом-потребителем |
| Worker-only helper / конкретный воркер | зовётся только из `back/src/workers/*` | в каталог домена, который запускает воркер, в формате Nest-провайдеров | вместе с этим доменом |
| Worker-runtime | `worker-pool.ts`, `base-worker.ts` — общий запускатель для 2+ доменов | shared worker-runtime (правило 5), инфра-шагом перед первым доменом с воркерами | перед `technical-conditions`/`orders` |
| Логгер | `back/src/logger/logger.ts` | `back-nest/src/logger/` — глобальный модуль + `LoggerService` | отдельной микро-задачей до миграции следующих доменов |

## Карта текущего `back/src/lib/`

Шпаргалка на момент создания документа. **Источник правды — критерии выше**: если файл добавили/переименовали — перепроверь по признакам, а не по этой таблице.

| Файл | Категория | Место в `back-nest/` | Фаза |
|---|---|---|---|
| `lib/user-role.util.ts` | чистая функция над `@miracle/types` | `back-nest/src/sessions/user-role.util.ts` | едет с `session.router.ts` |
| `lib/order/resolve-product-type.ts` | доменная утилита (зависит от `productTypesService`) | `back-nest/src/orders/resolve-product-type.ts` или приватный метод `OrdersService` | едет с `order.router.ts` |
| `lib/technical-condition/prepare-payload.ts` | доменная утилита (зависит от `productTypesService`) | `back-nest/src/technical-conditions/prepare-payload.ts` или приватный метод `TechnicalConditionsService` | едет с `technical-condition.router.ts` |
| `lib/tokens/tokens.ts` (`countTokens`) | чистая функция | **сделано:** `back-nest/src/files-content/count-tokens.ts` (локально). В слое 4 её начнут звать воркеры orders/TC → тогда поднять в `back-nest/src/common/count-tokens.ts` (правило 5) | едет с первым потребителем (`files-content` — `getTokens`) |
| `lib/convert/pdf-to-image.ts` | внешний API (pdfjs-dist) | `back-nest/src/convert/` как `@Global` сервис | едет с `files-content` (первый потребитель извлечения) |
| `lib/extraction/*` | worker-only / зовётся из `files-content` | `back-nest/src/files-content/` (домен-потребитель), вендоры — через DI из `@Global` `yandex`/`convert` | едет с `file-content.router.ts` |
| `lib/yandex/*` (Session, config, llm, vision) | внешний API + singleton | `back-nest/src/yandex/` как `@Global()`-модуль с `YandexService` (env через `AppConfigService`) | едет с первым потребителем (`files-content`) |

## Доменная утилита: правила переноса

Если файл попадает в категорию «доменная утилита», агент, мигрирующий соответствующий домен, **обязан** перенести её в рамках своей задачи. Правила:

1. **Имя файла сохраняем** (kebab-case): `back-nest/src/orders/resolve-product-type.ts`.
2. **Зависимости переключаются на DI.** Старый код импортирует `productTypesService` как module-level singleton — в Nest этого синглтона нет. Утилита либо принимает зависимость аргументом (`(llm, catalog) => ...`), либо становится приватным методом сервиса, который сам инжектит нужный соседний сервис.
3. **Короткая функция (≤ 15 строк), зовётся только из одного сервиса** → перенеси **методом этого сервиса**, не отдельным файлом. Меньше файлов — меньше шансов забыть про неё при следующей правке.
4. **Используется в 2+ сервисах одного домена** → отдельный файл в каталоге домена, без `index.ts` (баррели запрещены — см. `module.md`).
5. **Используется в 2+ разных доменах** → редкий случай. Сначала проверь, что это правда общий код, а не «случайно похожие» сигнатуры. Если общий — заведи `back-nest/src/common/<name>.ts` плоско, без подкаталогов. Этот шаг **обязательно** упомяни в описании PR.

## Логгер: отдельная фаза

Логгер выносится **отдельной задачей до миграции следующих доменов** — иначе каждый последующий агент выберет свой способ (один — `console.log`, второй — встроенный `new Logger()`, третий — winston напрямую), и потом это будет долго чинить.

Структура:

```
back-nest/src/logger/
  app-logger.service.ts    # обёртка над winston, реализует Nest LoggerService
  logger.module.ts         # @Global() module, exports AppLoggerService
```

### Принципиальные решения

- **Способ использования — только инжект через DI.** `new Logger(...)` из `@nestjs/common`, прямой импорт `winston` в доменах, `console.*` — запрещены. Это правило не меняется без обновления документа.
- **Способ связывания контекста — `forContext(name)` в конструкторе сервиса.** `AppLoggerService` экспортирует метод `forContext(context: string): AppLogger`, возвращающий лёгкую обёртку с прибитым контекстом (внутри — `winston.child({ context })`). Альтернатива `setContext()` отвергнута: она мутирует общий singleton.
- **Nest-логгер процессов** (старт, маршрутизатор, exception filter и т.п.) переключается на тот же сервис через `app.useLogger(app.get(AppLoggerService))` сразу после `NestFactory.create(..., { bufferLogs: true })` — чтобы стартовые сообщения не потерялись и шли через тот же транспорт.
- **Сохраняется helper `env(name, value, left?, right?)`** — он нужен для безопасного логирования секретов на старте. Реализация повторяет `back/src/logger/logger.ts` (truncate в середине).
- **`console.log`/`console.error`** допустимы **только** в `main.ts` **до** момента инициализации логгера (то есть до `await NestFactory.create(...)`). Нигде больше.

### API сервиса (минимальный контракт)

```ts
// back-nest/src/logger/app-logger.service.ts (контракт; конкретная реализация — задача агента)
import { Injectable, type LoggerService } from '@nestjs/common';

@Injectable()
export class AppLoggerService implements LoggerService {
    // Методы Nest LoggerService (для app.useLogger):
    log(message: unknown, context?: string): void;
    error(message: unknown, stack?: string, context?: string): void;
    warn(message: unknown, context?: string): void;
    debug?(message: unknown, context?: string): void;
    verbose?(message: unknown, context?: string): void;

    // Прикладной API для доменных сервисов:
    info(message: string, meta?: Record<string, unknown>): void;
    http(message: string, meta?: Record<string, unknown>): void;
    env(name: string, value: string | null | undefined, left?: number, right?: number): void;

    // Контекстное связывание для инжекта в доменный сервис:
    forContext(context: string): AppLogger;
}

export interface AppLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
    http(message: string, meta?: Record<string, unknown>): void;
    env(name: string, value: string | null | undefined, left?: number, right?: number): void;
}
```

### Шаблон использования в доменном сервисе

```ts
@Injectable()
export class OrdersService {
    private readonly logger: AppLogger;

    constructor(
        private readonly db: DatabaseService,
        loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(OrdersService.name);
    }

    async create(userId: string, fileId?: string): Promise<Stored<Order>> {
        const order = await this.db.collections.orders.create({ userId, fileId, details: undefined });
        this.logger.info('order created', { orderId: order.id, userId });
        return order;
    }
}
```

`forContext` вызывается **один раз в конструкторе**. Не зови его в каждом методе — это лишняя аллокация `child`-логгера на каждый запрос.

**Канонический пример** (сделано в слое 3): `back-nest/src/files-content/extraction/extraction.service.ts` — инжектит `AppLoggerService`, в конструкторе один раз `this.logger = loggerFactory.forContext(ExtractionService.name)`, далее `this.logger.info(...)`. Сам сервис — `back-nest/src/logger/app-logger.service.ts` (winston + `forContext` + `env`), модуль — `back-nest/src/logger/logger.module.ts` (`@Global`), подключён через `app.useLogger(app.get(AppLoggerService))` в `main.ts`.

## Что НЕ делаем

- **Не создаём `back-nest/src/lib/`** и **не создаём `back-nest/src/common/`** про запас. Только когда реально шарят 2+ модуля (правило 5).
- **Не создаём вендор-/worker-модули заранее, до их первого потребителя.** `yandex/`, `convert/`, `worker-pool` поднимаются вместе с доменом, которому они впервые нужны (`files-content`, затем `technical-conditions`/`orders`). Поднять их без потребителя — мёртвый код.
- **Не переносим вендорные SDK внутрь домена.** `yandex`/`convert` остаются `@Global`-модулями (stateful-singleton, нужны нескольким доменам). В домен едут только их **потребители** (`extraction`, воркеры), вызывая вендор через DI.
- **Не создаём helper-файлы внутри `dto/`** — там только классы, наследующие `createZodDto`. Утилиты живут рядом с сервисом, не в `dto/`.
- **Не оборачиваем чистые функции в сервисы без нужды.** Если функция не имеет состояния и не зависит от других сервисов — пусть остаётся функцией, не превращай её в `@Injectable()` ради «единообразия».

## Типичные грабли

- **Перенесли `lib/order/resolve-product-type.ts` в `orders/` как есть** — забыли убрать импорт `productTypesService` и переключиться на `ProductTypesService` через DI. Файл компилируется, но runtime ломается: module-level singleton не существует в `back-nest`.
- **Подняли `yandex/`/`convert/` до первого потребителя** (`files-content`). Это мёртвый код, который никто не зовёт. Вендор-модуль создаётся вместе с доменом, которому он впервые нужен.
- **Затащили `lib/yandex/*` внутрь домена** вместо `@Global`-модуля. Yandex-клиент — stateful-singleton на нескольких потребителей; ему место в `back-nest/src/yandex/` как `@Global`, а домен инжектит `YandexService`.
- **Создали `back-nest/src/common/` с одним файлом** — преждевременная абстракция. Этот файл сядет внутрь домена-потребителя.
- **Использовали `console.log` в `back-nest/`** после миграции логгера — это код-ревью-стоп. См. секцию «Логгер».
- **Использовали `new Logger(SomeService.name)` из `@nestjs/common`** — запрещено: решение зафиксировано на инжект `AppLoggerService` + `forContext(...)`. Встроенный `Logger` уходит в `app.useLogger(...)` и доменам не виден.
- **Импортировали `winston` напрямую в домене** — тоже запрещено. Все вызовы — через инжект `AppLoggerService`.
- **Вызвали `forContext(...)` в каждом методе сервиса** — это аллокация `child`-логгера на каждый запрос. Зови ровно один раз в конструкторе и сохраняй в `private readonly`.
- **Сделали утилиту приватным методом сервиса, а потом она понадобилась второму сервису** — выноси её в отдельный файл каталога **в том же PR**, в котором появляется второй потребитель. Не оставляй копи-паст «на потом».
