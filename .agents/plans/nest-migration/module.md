# Паттерн: новый доменный модуль

## Когда применять

Создаёшь новый домен в `back-nest/src/` (например, переносишь `orders.router.ts` → `back-nest/src/orders/`, либо добавляешь новую сущность). Каждый домен — отдельный каталог с одноимённым модулем.

## Контекст

Все доменные модули собираются в `back-nest/src/app.module.ts` в массиве `imports`. Глобальные модули (`AppConfigModule`, `DatabaseModule`, `AuthModule`) помечены `@Global()` — их провайдеры доступны из любого модуля без явного импорта. Но **`AuthGuard` нужно явно импортировать через `AuthModule`** в модуль, который его использует (см. `auth.md`).

Канонический пример — `back-nest/src/users/`.

## Структура каталога

```
back-nest/src/<domain>/
  <domain>.module.ts        # @Module({ controllers, providers, exports })
  <domain>.controller.ts    # HTTP-слой
  <domain>.service.ts       # бизнес-логика
  dto/
    <name>.dto.ts           # zod-схема + createZodDto (по одной на сценарий)
```

Если в домене больше одного контроллера или сервиса — добавляй файлы рядом с теми же суффиксами:

```
back-nest/src/orders/
  orders.module.ts
  orders.controller.ts
  orders-analysis.controller.ts
  orders.service.ts
  orders-analysis.service.ts
  dto/
    create-order.dto.ts
    update-order.dto.ts
    analyse-query.dto.ts
```

Не делай подкаталогов внутри `<domain>/` без необходимости. `dto/` — единственный обязательный.

## Шаблон `<domain>.module.ts`

```ts
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
    imports: [AuthModule],                    // только если используется AuthGuard
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],                 // если другие модули могут вызывать сервис
})
export class OrdersModule {}
```

После создания обязательно добавь модуль в `back-nest/src/app.module.ts`:

```ts
import { OrdersModule } from './orders/orders.module.js';

@Module({
    imports: [
        AppConfigModule,
        DatabaseModule,
        AuthModule,
        HealthModule,
        UsersModule,
        OrdersModule,        // ← новый модуль
    ],
})
export class AppModule {}
```

## Правила

1. **Имя каталога** — kebab-case в множественном числе: `orders/`, `product-types/`, `technical-conditions/`. Соответствует префиксу URL.
2. **Имя файла** — `<domain>.<role>.ts`: `orders.module.ts`, `orders.controller.ts`, `orders.service.ts`.
3. **Имя класса** — `<Domain><Role>`: `OrdersModule`, `OrdersController`, `OrdersService`.
4. **`imports`** — только то, чьи провайдеры реально используются и не глобальны. `AppConfigService` и `DatabaseService` глобальны — их **не** импортируй. `AuthGuard` — **импортируй** через `AuthModule`.
5. **`exports`** — сервис экспортируется тогда и только тогда, когда он используется в другом модуле. По умолчанию экспортируй — это дёшево.
6. **Без барреля** (`index.ts`) в каталоге модуля. Импорты — прямые: `./users.service.js`.
7. **Импорты с `.js`-суффиксом** для всех относительных путей (NodeNext-ESM требует).

## Типичные грабли

- **Забыл добавить модуль в `AppModule`** — Nest стартует без ошибок, но ни один эндпоинт нового домена не работает (404 на все пути). Проверяй стартовые логи Nest: если в `[RoutesResolver]` нет твоего контроллера — модуль не подключён.
- **Импортировал глобальный модуль повторно** (`DatabaseModule`, `AppConfigModule`) — Nest предупредит warning'ом, лишних провайдеров не создаст, но это шум. Удали.
- **`AuthGuard` не работает без `imports: [AuthModule]`** — DI не сможет резолвить `AuthGuard`, runtime-ошибка. См. `auth.md`.
- **Использовал кириллицу или camelCase в имени каталога** — не делай. Только kebab-case.

## Живой пример

`back-nest/src/users/`:

- `users.module.ts` — модуль с `imports: [AuthModule]` (потому что контроллер использует `AuthGuard`)
- `users.controller.ts` — один эндпоинт `GET /users/me`
- `users.service.ts` — один метод `getPublicById`, возвращает `Stored<User>` из `@miracle/types`
- каталога `dto/` **нет** — у `users` пока нет входных эндпоинтов, а response не оборачивается в DTO (см. `dto.md`)

Шире вариант появится после переноса первых полноценных доменов (`product-types`, `orders`).
