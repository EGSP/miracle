# Паттерн: DTO через zod + `nestjs-zod`

## Когда применять

- Описываешь форму **входных данных** эндпоинта: `@Body`, `@Query`, `@Param` с несколькими полями.
- Описываешь форму **публичного выхода**, который отличается от типа из `@miracle/types` (например, маппинг User → без `password`).
- В любом месте, где нужна и TS-типизация, и runtime-валидация одной и той же структуры.

## Контекст

В `back-nest` валидация на боундари сделана через `nestjs-zod` + `ZodValidationPipe` (включена глобально в [main.ts](../../back-nest/src/main.ts)). Это значит: если ты обернул DTO через `createZodDto(Schema)` и используешь его в сигнатуре `@Body() dto: SomeDto`, Nest **автоматически** провалидирует входное значение и выкинет `BadRequestException` с zod-ошибкой при невалидном вводе.

Канонический пример — `back-nest/src/users/dto/public-user.dto.ts`.

## Базовый паттерн (для нового DTO)

```ts
// back-nest/src/orders/dto/create-order.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreateOrderSchema = z.object({
    fileId: z.string().uuid().optional(),
});

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}
```

В контроллере:

```ts
@Post('create')
create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
}
```

Если запрос содержит `fileId: 123` (число вместо string), Nest вернёт 400 с zod-объяснением до того, как handler выполнится.

## Когда DTO избыточен — используй `@miracle/types`

Для **исходящего** значения (response эндпоинта) обычно достаточно TS-типа из `@miracle/types`. Runtime-валидация ответа не нужна — клиент доверяет серверу.

```ts
// ХОРОШО
@Get(':id')
getOne(@Param('id') id: string): Stored<Order> {
    return this.orders.getOrThrow(id);  // тип из @miracle/types
}

// ИЗБЫТОЧНО (не делай так без причины)
@Get(':id')
getOne(@Param('id') id: string): OrderResponseDto {
    return this.orders.getOrThrow(id);
}
```

DTO для response создавай только если форма отличается от хранимой (как `PublicUserDto` без `password`) или если нужно публиковать схему через OpenAPI (позже).

## Проблема: `z.infer` показывает развёрнутый тип в IDE

Если использовать обычное `type X = z.infer<typeof XSchema>`, IDE и сообщения об ошибках разворачивают полную форму объекта вместо имени:

```
Expected type:
{
  fileId?: string;
  details?: { ... raw expanded ... };
  // ...30 полей ...
}
```

Это нечитаемо при больших схемах. Три способа решить:

### Способ 1 — `createZodDto` (предпочтительный для входов)

`createZodDto(Schema)` возвращает класс. Если ты используешь его именем (`CreateOrderDto`), IDE покажет именно имя класса:

```ts
export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}

// В IDE на hover dto: ...
function handle(dto: CreateOrderDto) { /* IDE: "CreateOrderDto" */ }
```

Это работает потому, что класс — это nominal type в TypeScript. Имя сохраняется в типовых сообщениях.

### Способ 2 — `interface extends z.infer` (для типов без DI)

Когда DTO-класс не нужен (например, внутренний тип в сервисе), используй `interface`:

```ts
const InternalShapeSchema = z.object({ a: z.string(), b: z.number() });

// НЕ так — IDE покажет { a: string; b: number }
type InternalShape = z.infer<typeof InternalShapeSchema>;

// А так — IDE покажет InternalShape
interface InternalShape extends z.infer<typeof InternalShapeSchema> {}
```

`interface` (в отличие от `type`) сохраняет имя в hover и сообщениях.

### Способ 3 — `satisfies z.ZodType<T>` (когда TS-тип ведущий)

Когда исходник правды — TS-тип из `@miracle/types`, а zod-схема описывает его для валидации:

```ts
import type { Order } from '@miracle/types';

export const OrderSchema = z.object({
    id: z.string(),
    userId: z.string(),
    details: z.object({ ... }).optional(),
    // ...
}) satisfies z.ZodType<Order>;
```

`satisfies` гарантирует, что схема **может** валидировать значение типа `Order`. Если схема разъедется с типом — ошибка компиляции в самом этом файле, а не в потребителях.

**Минус** — приходится держать два определения. Применяй только когда `@miracle/types` действительно ведущий (типы переиспользуются на фронте, в общих пакетах) и его нельзя переписать на zod-схему.

## Где какие способы применять

| Сценарий | Способ |
|---|---|
| Входной DTO (`@Body`, `@Query`, многополевой `@Param`) | **createZodDto** |
| Публичный response, отличный от `@miracle/types` (как `PublicUser`) | **createZodDto** (необязательно, но удобно для будущего OpenAPI) |
| Внутренний тип в сервисе, использующий zod-схему | **interface extends z.infer** |
| zod-схема, описывающая существующий тип из `@miracle/types` | **satisfies z.ZodType<T>** |
| Простой response (соответствует типу из `@miracle/types`) | **Никакой DTO**, использовать тип напрямую |

## Шаблоны DTO

### Body DTO

```ts
// dto/create-order.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreateOrderSchema = z.object({
    fileId: z.string().uuid().optional(),
    details: z.object({
        description: z.string().min(1),
    }).optional(),
});

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}
```

### Query DTO

Особенности query: всё приходит строками, нужны `z.coerce.*` для чисел/булевых.

```ts
// dto/orders-query.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const OrdersQuerySchema = z.object({
    userId: z.string().optional(),
    isCompleted: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
});

export class OrdersQueryDto extends createZodDto(OrdersQuerySchema) {}
```

В контроллере:

```ts
@Get()
list(@Query() query: OrdersQueryDto) {
    return this.orders.list(query);
}
```

### Param DTO (если параметров несколько)

Для одного `@Param('id')` DTO не нужен. Для нескольких:

```ts
// dto/order-params.dto.ts
export const OrderParamsSchema = z.object({
    orderId: z.string(),
    itemId: z.string(),
});

export class OrderParamsDto extends createZodDto(OrderParamsSchema) {}
```

```ts
@Get(':orderId/items/:itemId')
getItem(@Param() params: OrderParamsDto) {
    return this.orders.getItem(params.orderId, params.itemId);
}
```

### Public response DTO (когда выход отличается от хранимого)

```ts
// dto/public-user.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const PublicUserSchema = z.object({
    id: z.string(),
    login: z.string().optional(),
    role: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export class PublicUserDto extends createZodDto(PublicUserSchema) {}
```

## Правила

1. **Один DTO — один файл** в `dto/`, имя `<scenario>.dto.ts` (`create-order.dto.ts`, `orders-query.dto.ts`, `public-user.dto.ts`).
2. **Имя класса — `<Scenario>Dto`**: `CreateOrderDto`, `OrdersQueryDto`, `PublicUserDto`.
3. **Имя экспортируемой схемы — `<Scenario>Schema`**: `CreateOrderSchema`, `OrdersQuerySchema`. Схема экспортируется, чтобы её можно было переиспользовать (например, для частичного обновления — `CreateOrderSchema.partial()`).
4. **Always export the schema separately** — даже если он используется только в DTO-классе. Это позволит делать derivative DTO без дублирования.
5. **Query DTO — всегда `z.coerce.*`** для не-строковых типов. Express/Fastify передают всё строками.
6. **Не складывай несколько сценариев в один DTO.** `CreateOrderDto` и `UpdateOrderDto` — два файла, даже если поля похожи (используй `.partial()` или `.pick()` если хочешь переиспользовать).

## Типичные грабли

- **Используешь `z.infer<typeof Schema>` в сигнатуре `@Body`** — пайп не активируется. Только `createZodDto` подключает валидацию.
- **`createZodDto` импортирован, но `ZodValidationPipe` не глобален** — валидация не работает. Проверь `main.ts`, там должно быть `app.useGlobalPipes(new ZodValidationPipe())`.
- **В query DTO используешь `z.number()` вместо `z.coerce.number()`** — валидация падает на любом запросе, потому что `?limit=10` — это строка `"10"`, не число.
- **Схема описана как top-level `const SomeSchema = z.object(...)` без экспорта, а класс DTO — экспортируется** — кому-то понадобится переиспользовать схему (через `.partial()`, `.pick()`, `.omit()`), а не получится. Экспортируй обе.
- **`satisfies z.ZodType<T>` падает с типовой ошибкой про variance** — обычно это сигнал, что zod-схема не покрывает все поля типа `T`. Допиши недостающие поля или используй `.passthrough()` (но это ослабляет валидацию).

## Живой пример

`back-nest/src/users/dto/public-user.dto.ts`:

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const PublicUserSchema = z.object({
    id: z.string(),
    login: z.string().optional(),
    role: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export class PublicUserDto extends createZodDto(PublicUserSchema) {}
```

Используется в response-типе [users.service.ts](../../back-nest/src/users/users.service.ts) и [users.controller.ts](../../back-nest/src/users/users.controller.ts).
