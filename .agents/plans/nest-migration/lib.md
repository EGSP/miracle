# Паттерн: куда переносить код из `back/src/lib/` и `back/src/logger/`

## Когда применять

При переносе любого домена в `back-nest/` ты увидишь импорты вида `from '../../lib/<...>'` или `from '../../logger/logger.js'` в исходных файлах `back/`. Этот документ описывает, **куда** каждый такой файл переезжает и **в какую фазу** его трогать.

## Главное правило одной фразой

> Общего каталога `lib/` или `common/` в `back-nest/` мы **не воссоздаём**. Каждый файл из `back/src/lib/` едет в место, которое определяется его природой зависимостей.

Это сознательное отступление от структуры старого `back/`. В Nest «общий код» — антипаттерн, пока он не реально общий: естественное место для функции — каталог её домена-потребителя.

## Категории и адреса

Перед переносом классифицируй файл по тому, **что он импортирует** и **кто его зовёт**:

| Природа | Признак | Куда в `back-nest/` | Когда |
|---|---|---|---|
| Доменная утилита | импортирует доменный сервис/коллекцию (`productTypesService`, `userDb`, …) | внутрь каталога домена-потребителя — отдельным файлом или приватным методом сервиса | вместе с миграцией этого домена |
| Чистая функция над `@miracle/types` | импортирует только из `@miracle/types` или без зависимостей | приватный helper в каталоге первого потребителя | вместе с первым потребителем |
| Внешний API/SDK | импортирует `@yandex-cloud/...`, `pdfjs-dist`, прочих вендоров | отдельный `@Global()`-модуль `back-nest/src/<vendor>/` с `<Vendor>Service` (env через `AppConfigService`) | **отложено** до фазы воркеров |
| Worker-only helper | зовётся только из `back/src/workers/*` | в worker-каталоги, в формате Nest-провайдеров | **отложено** до фазы воркеров |
| Логгер | `back/src/logger/logger.ts` | `back-nest/src/logger/` — глобальный модуль + `LoggerService` | отдельной микро-задачей до миграции следующих доменов |

## Карта текущего `back/src/lib/`

Шпаргалка на момент создания документа. **Источник правды — критерии выше**: если файл добавили/переименовали — перепроверь по признакам, а не по этой таблице.

| Файл | Категория | Место в `back-nest/` | Фаза |
|---|---|---|---|
| `lib/user-role.util.ts` | чистая функция над `@miracle/types` | приватный helper в `back-nest/src/auth/` (или первого потребителя) | едет с `auth.router.ts` |
| `lib/order/resolve-product-type.ts` | доменная утилита (зависит от `productTypesService`) | `back-nest/src/orders/resolve-product-type.ts` или приватный метод `OrdersService` | едет с `order.router.ts` |
| `lib/technical-condition/prepare-payload.ts` | доменная утилита (зависит от `productTypesService`) | `back-nest/src/technical-conditions/prepare-payload.ts` или приватный метод `TechnicalConditionsService` | едет с `technical-condition.router.ts` |
| `lib/tokens/tokens.ts` (`countTokens`) | чистая функция | helper домена-потребителя | **отложено** — сейчас зовут только воркеры |
| `lib/convert/pdf-to-image.ts` | внешний API (pdfjs-dist) | `back-nest/src/convert/` как сервис | **отложено** до фазы воркеров |
| `lib/extraction/*` | worker-only | в worker-каталоги | **отложено** |
| `lib/yandex/*` (Session, config, llm, vision) | внешний API + singleton | `back-nest/src/yandex/` как `@Global()`-модуль с `YandexService` (env через `AppConfigService`) | **отложено**, едет вместе с первой реальной потребностью |

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

После выполнения задачи в эту секцию дописывается ссылка «Канонический пример» на конкретный доменный сервис, где логгер уже используется (по аналогии с `users/` для остальных паттернов).

## Что НЕ делаем

- **Не создаём `back-nest/src/lib/`** и **не создаём `back-nest/src/common/`** про запас. Только когда реально шарят 2+ модуля (правило 5).
- **Не переносим заранее** worker-инфраструктуру (`extraction/`, `convert/`, `yandex/`). Её перепишет фаза воркеров под Nest-DI; копировать сейчас — значит создавать мёртвый код, который потом всё равно выбросят.
- **Не создаём helper-файлы внутри `dto/`** — там только классы, наследующие `createZodDto`. Утилиты живут рядом с сервисом, не в `dto/`.
- **Не оборачиваем чистые функции в сервисы без нужды.** Если функция не имеет состояния и не зависит от других сервисов — пусть остаётся функцией, не превращай её в `@Injectable()` ради «единообразия».

## Типичные грабли

- **Перенесли `lib/order/resolve-product-type.ts` в `orders/` как есть** — забыли убрать импорт `productTypesService` и переключиться на `ProductTypesService` через DI. Файл компилируется, но runtime ломается: module-level singleton не существует в `back-nest`.
- **Скопировали `lib/yandex/*` в `back-nest/`** до фазы воркеров. Это мёртвый код, который никто не зовёт; кроме того, его всё равно перепишут под `@Global` + `AppConfigService`. Не делай.
- **Создали `back-nest/src/common/` с одним файлом** — преждевременная абстракция. Этот файл сядет внутрь домена-потребителя.
- **Использовали `console.log` в `back-nest/`** после миграции логгера — это код-ревью-стоп. См. секцию «Логгер».
- **Использовали `new Logger(SomeService.name)` из `@nestjs/common`** — запрещено: решение зафиксировано на инжект `AppLoggerService` + `forContext(...)`. Встроенный `Logger` уходит в `app.useLogger(...)` и доменам не виден.
- **Импортировали `winston` напрямую в домене** — тоже запрещено. Все вызовы — через инжект `AppLoggerService`.
- **Вызвали `forContext(...)` в каждом методе сервиса** — это аллокация `child`-логгера на каждый запрос. Зови ровно один раз в конструкторе и сохраняй в `private readonly`.
- **Сделали утилиту приватным методом сервиса, а потом она понадобилась второму сервису** — выноси её в отдельный файл каталога **в том же PR**, в котором появляется второй потребитель. Не оставляй копи-паст «на потом».
