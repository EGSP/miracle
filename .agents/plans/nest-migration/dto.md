# Паттерн: DTO через zod-схемы из `@miracle/types`

## Когда применять

- Описываешь форму **входных данных** эндпоинта (`@Body`, `@Query`, многополевой `@Param`).
- Думаешь, в каком виде вернуть response.
- Нужна общая структура, которую и бэк проверяет, и фронт типизирует/валидирует в форме.

## Архитектурное решение

**Zod-схемы общих DTO живут в `@miracle/types/src/schemas/<domain>.schemas.ts`.** Их импортируют:

- **back-nest** — оборачивает в `createZodDto(Schema)` для интеграции с `ZodValidationPipe`;
- **front** — использует напрямую (`z.infer<typeof Schema>` для типа, сама схема — для react-hook-form/валидации).

Это значит: **никакого копирования схем генератором клиента**. И бэк, и фронт видят одну и ту же схему через workspace-импорт.

**Response-типы — не схемы**, а обычные TS-типы в `@miracle/types` (`User`, `Order`, `Stored<Order>`, и т.п.). Runtime-валидация ответа на фронте не нужна — фронт доверяет своему же серверу.

Канонический пример: для users пока нет входных эндпоинтов, поэтому каталог `back-nest/src/users/dto/` отсутствует. Response — `Stored<User>` из `@miracle/types` напрямую, без обёртки. Появится первый INPUT-эндпоинт (например, при миграции orders) — там же будет первый рабочий пример DTO.

## Контекст в монорепе

```
types/src/
  schemas/
    index.ts                    # barrel, обязательно дописывать новые схемы
    orders.schemas.ts           # появится при миграции orders
    sessions.schemas.ts         # появится при миграции sessions
    ...
  user.ts                       # response-типы и доменные модели
  order.ts
  ...
```

```
back-nest/src/<domain>/
  dto/
    <scenario>.dto.ts           # тонкая обёртка: extends createZodDto(SchemaFromTypes)
```

`@miracle/types` имеет zod как **runtime-зависимость** (см. `types/package.json`). Это сознательное решение — пакет перестаёт быть «только типы», теперь там и схемы. Имя пакета сохраняем для совместимости.

## Шаги при добавлении нового DTO

### Шаг 1 — схема в `@miracle/types/src/schemas/`

```ts
// types/src/schemas/orders.schemas.ts
import { z } from 'zod';

export const CreateOrderSchema = z.object({
    fileId: z.string().uuid().optional(),
});

export const OrdersQuerySchema = z.object({
    userId: z.string().optional(),
    isCompleted: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
});
```

Соглашения:

- **Имя файла:** `<domain>.schemas.ts` (kebab-case множественного числа).
- **Имя схемы:** `<Scenario>Schema` (`CreateOrderSchema`, `OrdersQuerySchema`).
- **Импорт** — только из `'zod'`. Доп. зависимостей избегать (если нужны вспомогательные типы — из соседних файлов `@miracle/types`).
- **Для query-схем** — обязательно `z.coerce.*` для не-строковых типов (HTTP передаёт всё строками).

### Шаг 2 — barrel

```ts
// types/src/schemas/index.ts
export * from './orders.schemas.js';
```

Без этого схема не попадёт в `@miracle/types` (главный `index.ts` ре-экспортирует `./schemas/index.js`).

### Шаг 3 — пересобрать `@miracle/types`

```bash
npm run build --workspace=@miracle/types
```

Обязательно, потому что back-nest и front тянут собранный `dist/`.

### Шаг 4 — DTO в back-nest

```ts
// back-nest/src/orders/dto/create-order.dto.ts
import { createZodDto } from 'nestjs-zod';
import { CreateOrderSchema } from '@miracle/types';

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}
```

```ts
// back-nest/src/orders/dto/orders-query.dto.ts
import { createZodDto } from 'nestjs-zod';
import { OrdersQuerySchema } from '@miracle/types';

export class OrdersQueryDto extends createZodDto(OrdersQuerySchema) {}
```

Контроллер использует DTO как обычно:

```ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersQueryDto } from './dto/orders-query.dto.js';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
    @Get()
    list(@Query() query: OrdersQueryDto) { /* ... */ }

    @Post('create')
    create(@Body() dto: CreateOrderDto) { /* ... */ }
}
```

`ZodValidationPipe` (глобальный в `main.ts`) автоматически провалидирует body/query — упадёт **до** handler-а с понятным zod-сообщением, если данные не подошли.

### Шаг 5 — на фронте

Схема импортируется напрямую из `@miracle/types`:

```ts
// форма с react-hook-form
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateOrderSchema } from '@miracle/types';
import type { z } from 'zod';

type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

function CreateOrderForm() {
    const form = useForm<CreateOrderInput>({
        resolver: zodResolver(CreateOrderSchema),
    });
    // ...
}
```

Тип для самого запроса (через сгенерированный клиент) появится автоматически — генератор клиента эмитит alias `export interface CreateOrderDto extends z.infer<typeof CreateOrderSchema> {}` в `front/src/lib/generated/models/orders.models.ts`. Подробно — в `client-generator.md`.

## Response: TS-тип, не схема

Response **не оборачивается** в schema. Возвращается:

- готовый тип из `@miracle/types`: `User`, `Order`, `Stored<Order>` (это `Order & { id, createdAt, updatedAt }`).
- если нужна публичная форма, отличная от хранимой (без `password`, например) — используй `Stored<User>` напрямую и в сервисе делай `delete`/`omit`.

```ts
// back-nest/src/users/users.service.ts (живой пример)
import type { Stored, User } from '@miracle/types';

@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService) {}

    getPublicById(id: string): Stored<User> {
        const user = this.db.collections.users.getById(id);
        if (!user) throw new NotFoundException(`User ${id} not found`);
        const { password: _password, ...publicUser } = user;
        return publicUser as Stored<User>;
    }
}
```

```ts
// back-nest/src/users/users.controller.ts (живой пример)
@Get('me')
@UseGuards(AuthGuard)
getMe(@CurrentUser() user: AuthenticatedUser): Stored<User> {
    return this.users.getPublicById(user.id);
}
```

Никаких `PublicUserDto` и обёрток через `createZodDto` — для response это лишнее.

## Что делать, если response отличается от хранимой формы

Если хранимая форма содержит поля, которые **нельзя** показывать клиенту (`password`, internal-флаги), но нет готового подходящего типа в `@miracle/types`:

1. Добавить в `@miracle/types` явный public-тип:
   ```ts
   // types/src/order.ts
   export type Order = { /* публичные поля */ };
   export type OrderInternal = Order & { /* внутренние поля */ };
   ```
2. В `back-nest/src/database/collections.ts` коллекция типизируется через `OrderInternal`.
3. Сервис маппит `OrderInternal → Order` при выдаче.
4. Контроллер возвращает `Stored<Order>` (без internal).

Это правило: **internal-формы у бэка, public-формы — общие**. Public всегда в `@miracle/types`.

## IDE-проблема с `z.infer` — решена дизайном

Раньше была проблема: `type Foo = z.infer<typeof FooSchema>` в IDE показывает развёрнутый объект, не имя `Foo`. Это решается двумя путями, оба применимы здесь:

1. **На бэке** — DTO-класс через `createZodDto`. Класс `CreateOrderDto` сохраняет имя в hover/ошибках.
2. **На фронте** — генератор эмитит `interface CreateOrderDto extends z.infer<typeof CreateOrderSchema> {}`. `interface` (в отличие от `type`) сохраняет имя.

Если пишешь типы на фронте вручную (например, для форм) — тот же `interface`-приём:

```ts
import type { z } from 'zod';
import { CreateOrderSchema } from '@miracle/types';

// НЕ так — IDE покажет развёрнутый объект:
// type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// А так — IDE покажет CreateOrderInput:
interface CreateOrderInput extends z.infer<typeof CreateOrderSchema> {}
```

## Правила

1. **Все общие схемы — в `@miracle/types/src/schemas/`.** Не в back-nest, не во фронте.
2. **Один файл — один домен** (`orders.schemas.ts`, `sessions.schemas.ts`). Не «все схемы в одном файле».
3. **DTO в back-nest — тонкая обёртка** через `createZodDto(SchemaFromTypes)`. Без локальных модификаций схемы.
4. **Имена**: схема — `<Scenario>Schema`, класс DTO — `<Scenario>Dto`. Файлы — kebab-case (`create-order.dto.ts`, `orders-query.dto.ts`).
5. **Query** — `z.coerce.*` обязательно для not-string полей.
6. **Response** — без zod. Только TS-типы из `@miracle/types`.
7. **Не дублируй схему в back-nest или front** — workspace-импорт это решает.
8. **`@miracle/types` не имеет дополнительных зависимостей** кроме `zod`. Не подключай туда `nestjs-zod`, `@hookform/resolvers` и т.п. — они работают **поверх** zod-схемы в своём пакете.

## Типичные грабли

- **Забыл барель** (`schemas/index.ts`) — схема не экспортируется из `@miracle/types`. Симптом: `import { CreateOrderSchema } from '@miracle/types'` даёт `undefined`. Проверь, что в `schemas/index.ts` есть `export * from './<domain>.schemas.js'`.
- **Забыл пересобрать `@miracle/types`** — back-nest и front видят старую версию (без новой схемы). Симптом: TS-ошибка про unknown export. Лечится `npm run build --workspace=@miracle/types`.
- **`@Body() dto: SomeSchemaInferred`** (TS-тип, не DTO-класс) — `ZodValidationPipe` не сработает, body не валидируется. Только `extends createZodDto(...)`.
- **`z.number()` в query вместо `z.coerce.number()`** — валидация падает на каждом запросе, потому что `?limit=10` это строка.
- **Импорт схемы из `@miracle/types/dist/schemas/...`** — нельзя, только через корневой `'@miracle/types'`. Если IDE подставила глубокий путь — поправь руками.
- **Схема импортирует backend-only код** — она перестаёт работать на фронте при build. Схемы должны быть чистыми zod-выражениями + импорты только из `'zod'` и соседних файлов `@miracle/types`.

## Живой пример

В `back-nest/src/users/` входных DTO **нет** (только `GET /users/me` без body/query/params). Поэтому каталога `dto/` тоже нет — он появится с первым INPUT-эндпоинтом (например, при миграции `orders.router.ts`).

Сейчас демо демонстрирует только response-сторону:

- [back-nest/src/users/users.service.ts](../../back-nest/src/users/users.service.ts) — возвращает `Stored<User>` из `@miracle/types`
- [back-nest/src/users/users.controller.ts](../../back-nest/src/users/users.controller.ts) — `@Get('me')` без обёрток

Когда первый агент мигрирует `back/src/routers/orders.router.ts` (или `sessions.router.ts`) — там появится первый рабочий пример полной цепочки `schemas/* → dto/* → controller`.
