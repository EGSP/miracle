# Паттерн: контроллер из `*.router.ts`

## Когда применять

Переносишь любой `back/src/routers/<x>.router.ts` в `back-nest/src/<x>/<x>.controller.ts`.

## Контекст

Старый код использует кастомный `route.get / route.post / ...` + `defineRouter`. Каждый handler возвращает значение или `err.*`. В Nest то же самое выражается через декораторы (`@Controller`, `@Get`, `@Post`, ...) и исключения (`throw new *Exception`).

Контроллер **не должен содержать бизнес-логики** — только парсинг входа, вызов сервиса, возврат результата. Любое условие/проверку/работу с БД — в сервис (см. `service.md`).

Канонический пример — `back-nest/src/users/users.controller.ts`.

## Было (Express + typed-routing)

```ts
// back/src/routers/orders.router.ts
import { defineRouter, route } from "../app/router.js";
import { err } from "../app/index.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { ordersService } from "../databases/order.db.js";

const getOrder = route.get('/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const order = await ordersService.get(params.id);
        if (!order) {
            return err.notFound('Order not found');
        }
        return order;
    },
});

const createOrder = route.post('/create', {
    handler: async ({ locals, body }: { locals: Record<string, unknown>, body: CreateOrderDTO }) => {
        const user = locals.user as User | undefined;
        if (!user?.id) {
            return err.unauthorized('Authenticated user is missing');
        }
        return ordersService.create(user.id, body.fileId);
    },
});

export const orderRouter = defineRouter('/order', {
    middlewares: [authMiddleware],
    routes: [getOrder, createOrder],
});
```

## Стало (Nest)

```ts
// back-nest/src/orders/orders.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import type { Stored, Order } from '@miracle/types';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Get(':id')
    getOne(@Param('id') id: string): Stored<Order> {
        return this.orders.getOrThrow(id);
    }

    @Post('create')
    create(
        @CurrentUser() user: AuthenticatedUser,
        @Body() dto: CreateOrderDto,
    ): Promise<Stored<Order>> {
        return this.orders.create(user.id, dto.fileId);
    }
}
```

## Соответствие методов

| Старое | Новое |
|---|---|
| `route.get(path, ...)` | `@Get(path)` |
| `route.post(path, ...)` | `@Post(path)` |
| `route.put(path, ...)` | `@Put(path)` |
| `route.patch(path, ...)` | `@Patch(path)` |
| `route.delete(path, ...)` | `@Delete(path)` |

## Соответствие частей запроса

| Старое | Новое |
|---|---|
| `params: { id: string }` | `@Param('id') id: string` |
| `params: OrderParams` (несколько полей) | `@Param() params: OrderParams` |
| `query: OrderQuery` | `@Query() query: OrderQueryDto` (через `createZodDto`) |
| `body: CreateOrderDTO` | `@Body() dto: CreateOrderDto` (через `createZodDto`) |
| `cookies` | `@Req() req: FastifyRequest` → `req.cookies?.X` (но обычно достаточно `AuthGuard` + `@CurrentUser`) |
| `headers` | `@Headers('header-name') value: string` или `@Headers() all: Record<string, string>` |
| `locals.user` | `@CurrentUser() user: AuthenticatedUser` (см. `auth.md`) |
| `req` (для низкоуровневых операций) | `@Req() req: FastifyRequest` |
| `res` (для cookie / низкого уровня) | `@Res({ passthrough: true }) res: FastifyReply` |

**Важно про `@Res({ passthrough: true })`** — без `passthrough: true` Nest перестаёт сам сериализовать возвращаемое значение, и ты должен вызывать `res.send()` вручную. С `passthrough: true` ты можешь использовать `res.setCookie(...)` и при этом просто `return data` — Nest пошлёт ответ.

## Обработка ошибок

Полная таблица — в `errors.md`. Краткая шпаргалка:

| Старое | Новое |
|---|---|
| `return err.badRequest(msg)` | `throw new BadRequestException(msg)` |
| `return err.unauthorized(msg)` | `throw new UnauthorizedException(msg)` |
| `return err.forbidden(msg)` | `throw new ForbiddenException(msg)` |
| `return err.notFound(msg)` | `throw new NotFoundException(msg)` |
| `return err.conflict(msg)` | `throw new ConflictException(msg)` |
| `return err.validation(msg)` | автоматом через `ZodValidationPipe` для `@Body`/`@Query` |
| `return err.internal(msg)` | `throw new InternalServerErrorException(msg)` |
| `throw error` | `throw error` (Nest сам поймает в 500) |

**Правило для проверки/выбрасывания** — выбрасывать только в контроллере, если проверка касается HTTP-семантики (например, валидация формата id). Доменные проверки (entity not found, conflict по бизнес-правилу) — выбрасывать **в сервисе**, контроллер не оборачивает.

## CORS, body-parser, cookies

В Nest+Fastify это уже глобально настроено в `main.ts` (см. `bootstrap.md`):

- CORS включён и читает `CORS_OPEN`/`CORS_ORIGIN` из env
- Body парсится автоматически
- Cookies парсятся через `fastify-cookie`

В контроллере про это думать не нужно.

## Префикс пути

`@Controller('orders')` в Nest эквивалентен `defineRouter('/order', ...)` в старом коде. **Слэш в начале не нужен** — Nest добавляет сам.

Если внутри роутера были разные base-пути для роутов — каждый из них становится отдельным контроллером:

```ts
// Старое — один роутер
defineRouter('/orders', { routes: [getOrders, getStats] });
// /orders     ← getOrders
// /orders/stats  ← getStats

// Новое — один контроллер
@Controller('orders')
export class OrdersController {
    @Get() list() {}
    @Get('stats') stats() {}
}
```

## Правила

1. **Контроллер — только HTTP-слой.** Бизнес-логика, проверки прав, работа с БД — в сервис.
2. **Возвращай значение, не пиши в `res`** (кроме случаев с cookies — там `@Res({ passthrough: true })`).
3. **Один контроллер — один префикс.** Если у тебя были разные префиксы в одном роутере — раздели на несколько контроллеров.
4. **`@UseGuards(AuthGuard)`** на классе, если защищены все методы. На отдельном методе — если защищён только он.
5. **Все @Body/@Query — через DTO с `createZodDto`** (см. `dto.md`). Никаких inline-типов в сигнатуре.
6. **Не пиши пустой DTO просто чтобы быть единообразным** — если эндпоинт не принимает body/query, не объявляй параметр.

## Типичные грабли

- **`@UseGuards(AuthGuard)` без `imports: [AuthModule]` в модуле** → runtime ошибка про unresolved provider. См. `auth.md`.
- **`@Param('id')` без `id` в path** (например, `@Get()` вместо `@Get(':id')`) → значение undefined. TypeScript не поймает.
- **Возвращаешь Promise, а сигнатура говорит синхронный тип** — Nest сам await-нет, но IDE/типы могут ввести в заблуждение. Лучше явно `Promise<...>` если внутри `await`.
- **Использование `@Body() dto: SomeSchema` (TypeScript-тип zod-схемы) вместо `extends createZodDto(...)`** — пайп не сработает, body не валидируется. Body **обязан** быть классом, отнаследованным от `createZodDto`. Подробно в `dto.md`.
- **Импорт `FastifyRequest` из `@nestjs/platform-fastify`** — не оттуда. Импортируй `import type { FastifyRequest } from 'fastify'`.

## Живой пример

`back-nest/src/users/users.controller.ts` — минимальный контроллер с `AuthGuard` + `@CurrentUser`:

```ts
@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get('me')
    @UseGuards(AuthGuard)
    getMe(@CurrentUser() user: AuthenticatedUser): PublicUserDto {
        return this.users.getPublicById(user.id);
    }
}
```
