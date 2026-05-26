# Паттерн: сервис домена

## Когда применять

Переносишь любой `*Service` из `back/src/databases/<x>.db.ts` (там, где у старого `back` сервис и коллекция жили в одном файле) либо выделяешь бизнес-логику из `back/src/routers/<x>.router.ts` в отдельный класс.

## Контекст

В Nest всё, что не HTTP — живёт в сервисе. Сервис — `@Injectable()` класс, который инжектирует свои зависимости (`DatabaseService`, другие сервисы, конфиг) через конструктор.

В старом `back` файл [back/src/databases/user.db.ts](../../back/src/databases/user.db.ts) смешивает три вещи: создание коллекции (`userDb`), регистрацию в `DbRegistry`, и сервис (`userService` как plain object). В `back-nest` это разделено:

- создание коллекции → `back-nest/src/database/collections.ts` (см. `database.md`)
- сервис → `back-nest/src/<domain>/<domain>.service.ts`

Канонический пример сервиса — `back-nest/src/users/users.service.ts`.

## Было (Express)

```ts
// back/src/databases/order.db.ts
export const orderDb = registerDb('orders', await JsonCollection.create<Order>('orders'));

declare module './db.js' {
    interface DbRegistry {
        orders: typeof orderDb;
    }
}

export const ordersService = {
    create: async (userId: string, fileId?: string): Promise<Stored<Order>> => {
        return orderDb.create({ userId, fileId, details: undefined });
    },

    get: async (id: string): Promise<Stored<Order> | undefined> => {
        return orderDb.getById(id);
    },

    getOrders: (query: OrderQuery): Stored<Order>[] => {
        return orderDb.ref().filter(/* ... */);
    },

    update: async (id: string, patch: Partial<Order>): Promise<Stored<Order> | undefined> => {
        return orderDb.update(id, patch);
    },
};
```

Используется в `routers/order.router.ts` напрямую как module-level singleton:

```ts
import { ordersService } from "../databases/order.db.js";

const getOrder = route.get('/:id', {
    handler: async ({ params }) => {
        const order = await ordersService.get(params.id);
        if (!order) return err.notFound('Order not found');
        return order;
    },
});
```

## Стало (Nest)

Шаг 1 — добавить коллекцию централизованно (`database/collections.ts`, подробно в `database.md`):

```ts
// back-nest/src/database/collections.ts
import type { Order } from '@miracle/types';
// ...

export async function createCollections(dbDir: string) {
    return {
        users: await JsonCollection.create<UserInternal>('users', dbDir),
        orders: await JsonCollection.create<Order>('orders', dbDir),   // ← добавлено
    } as const;
}
```

Шаг 2 — сервис домена:

```ts
// back-nest/src/orders/orders.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Stored, Order } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import type { OrdersQueryDto } from './dto/orders-query.dto.js';

@Injectable()
export class OrdersService {
    constructor(private readonly db: DatabaseService) {}

    create(userId: string, fileId?: string): Promise<Stored<Order>> {
        return this.db.collections.orders.create({
            userId,
            fileId,
            details: undefined,
        });
    }

    getOrThrow(id: string): Stored<Order> {
        const order = this.db.collections.orders.getById(id);
        if (!order) {
            throw new NotFoundException(`Order ${id} not found`);
        }
        return order;
    }

    list(query: OrdersQueryDto): Stored<Order>[] {
        return this.db.collections.orders.ref().filter((order) => {
            if (query.userId !== undefined && order.userId !== query.userId) return false;
            // ...
            return true;
        });
    }

    update(id: string, patch: Partial<Order>): Promise<Stored<Order> | undefined> {
        return this.db.collections.orders.update(id, patch);
    }
}
```

Шаг 3 — сервис регистрируется в модуле:

```ts
// back-nest/src/orders/orders.module.ts
@Module({
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule {}
```

## Правила

1. **`@Injectable()`** обязательно — без него Nest не сможет инжектировать.
2. **Зависимости — через конструктор** (`private readonly`). Не используй `static` методы и не обращайся к синглтонам напрямую.
3. **`DatabaseService` инжектится без импорта модуля** — он глобальный. То же про `AppConfigService`.
4. **Сервис кидает исключения**, а не возвращает специальные значения. Не `return undefined` если «не найдено» — `throw new NotFoundException(...)`. Это разгружает контроллер от повторяющихся проверок.

   Исключение: если по бизнес-смыслу «не найдено» — это нормальный результат (например, `findIfExists`), оставь `T | undefined` и пусть контроллер решает.
5. **Возвращаемые типы — из `@miracle/types`** (`User`, `Stored<Order>` и т.п.). DTO — только для входа.
6. **Не сохраняй состояние в полях класса.** Сервис должен быть stateless. Кэши — только через продуманные провайдеры (или вообще не делать без причины).
7. **Если в старом сервисе есть метод, нужный только инфраструктуре** (например, `userService.getInternal()` возвращает форму с password) — оставь его в сервисе, но имя должно отражать опасность: `getInternalForAuth()`, `getRawForMigration()`. Не помечай `private`, если зовётся из других сервисов (AuthService использует UsersService).

## Где живёт логика «public-форма vs internal-форма»

Если в БД хранится больше полей, чем нужно отдавать клиенту (как у `User` — есть `password`, отдаётся без него), маппинг — **в сервисе**:

```ts
getPublicById(id: string): PublicUserDto {
    const user = this.db.collections.users.getById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    const { password: _password, ...publicUser } = user;
    return publicUser as PublicUserDto;
}
```

Если нужны обе формы — два метода: `getPublicById(id)` и `getInternalById(id)`. Не возвращай internal-форму из «обычного» метода.

## Типичные грабли

- **Импорт `DatabaseService` из неверного пути** — это `../database/database.service.js`, не `database/database.service`. NodeNext требует `.js` и относительный путь.
- **Создание `JsonCollection` внутри сервиса** — антипаттерн. Коллекции декларируются только в `database/collections.ts`. См. `database.md`.
- **Сервис, который инжектит контроллер** — циклическая зависимость. Контроллер инжектит сервис, не наоборот.
- **`@Injectable()` забыт** → Nest не сможет резолвить, runtime-ошибка про unknown provider.
- **Сервис экспортируется в `providers`, но не в `exports`** — внутри модуля работает, другим модулям недоступен. Если планируешь использовать из других модулей — добавь в `exports`.
- **Использование `process.env.X` внутри сервиса** — не делай. Только через `AppConfigService` (он глобальный, инжектится бесплатно).

## Живой пример

`back-nest/src/users/users.service.ts`:

```ts
@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService) {}

    getPublicById(id: string): PublicUserDto {
        const user = this.db.collections.users.getById(id);
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }
        const { password: _password, ...publicUser } = user;
        return publicUser as PublicUserDto;
    }
}
```
