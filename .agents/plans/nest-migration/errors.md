# Паттерн: ошибки (`err.*` → `*Exception`)

## Когда применять

Переносишь любой код из старого `back`, который возвращает `err.*` (`err.notFound`, `err.unauthorized`, и т.п.) или просто бросает исключение.

## Контекст

Старый `back` использует кастомный механизм: handler возвращает либо успешное значение, либо объект-ошибку через `err.*` (см. [back/src/app/errors.ts](../../back/src/app/errors.ts)). Этот формат **не** реплицируется в `back-nest`. Nest использует стандартный механизм исключений:

- `throw new <Http>Exception(message)` — Nest сам сериализует в JSON-ответ с нужным статусом
- Глобальный exception filter ловит unhandled exceptions и отдаёт 500

Контракт ответа отличается от старого (`{ok: false, status, code, message}`) — теперь это стандартный Nest-формат (`{statusCode, message, error}`). Это сознательное решение: фронт пока с back-nest не общается, формат можно унифицировать позже.

## Таблица соответствия

| Старое (`back/src/app/errors.ts`) | Новое (Nest) | Импорт |
|---|---|---|
| `return err.badRequest(msg, details?)` | `throw new BadRequestException(msg)` | `@nestjs/common` |
| `return err[400](msg)` | `throw new BadRequestException(msg)` | `@nestjs/common` |
| `return err.unauthorized(msg)` | `throw new UnauthorizedException(msg)` | `@nestjs/common` |
| `return err[401](msg)` | `throw new UnauthorizedException(msg)` | `@nestjs/common` |
| `return err.forbidden(msg)` | `throw new ForbiddenException(msg)` | `@nestjs/common` |
| `return err[403](msg)` | `throw new ForbiddenException(msg)` | `@nestjs/common` |
| `return err.notFound(msg)` | `throw new NotFoundException(msg)` | `@nestjs/common` |
| `return err[404](msg)` | `throw new NotFoundException(msg)` | `@nestjs/common` |
| `return err.conflict(msg)` | `throw new ConflictException(msg)` | `@nestjs/common` |
| `return err[409](msg)` | `throw new ConflictException(msg)` | `@nestjs/common` |
| `return err.validation(msg, details)` | **автоматом** через `ZodValidationPipe` | — |
| `return err[422](msg)` | `throw new UnprocessableEntityException(msg)` (редко нужно вручную) | `@nestjs/common` |
| `return err.internal(msg)` | `throw new InternalServerErrorException(msg)` | `@nestjs/common` |
| `return err[500](msg)` | `throw new InternalServerErrorException(msg)` | `@nestjs/common` |
| `throw error` (необработанное) | `throw error` (Nest сам поймает в 500) | — |

## Где throw — в контроллере или в сервисе

**Правило**: бросать там, где обнаружено условие.

- Сервис нашёл, что entity нет в БД — `throw new NotFoundException(...)` **в сервисе**.
- Контроллер валидирует формат, не покрытый zod (редко) — `throw new BadRequestException(...)` **в контроллере**.
- Сервис обнаружил конфликт бизнес-правила (логин занят, заказ уже подтверждён) — `throw new ConflictException(...)` **в сервисе**.

Контроллер не должен «оборачивать» сервисные ошибки. Если сервис кидает `NotFoundException` — контроллер не ловит её для повторного выкидывания.

## Было / стало — типичные случаи

### «Сущность не найдена»

```ts
// Было
const order = await ordersService.get(id);
if (!order) {
    return err.notFound('Order not found');
}
return order;

// Стало — в сервисе:
getOrThrow(id: string): Stored<Order> {
    const order = this.db.collections.orders.getById(id);
    if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
}

// Контроллер просто:
@Get(':id')
getOne(@Param('id') id: string) {
    return this.orders.getOrThrow(id);
}
```

### «Невалидный body»

```ts
// Было (валидации body не было; делали вручную)
if (!body.login) {
    return err.badRequest('Login is required');
}

// Стало — пишешь zod-схему, валидация автоматическая:
export const LoginSchema = z.object({
    login: z.string().min(1),
    password: z.string().min(1),
});
export class LoginDto extends createZodDto(LoginSchema) {}

@Post('login')
login(@Body() dto: LoginDto) {
    // dto.login и dto.password гарантированно непустые
}
```

При запросе `{ login: "" }` Nest вернёт **400** с zod-объяснением до того, как handler выполнится.

### «Доступ запрещён»

```ts
// Было
if (user.role !== 'admin') {
    return err.forbidden('Admin only');
}

// Стало — в сервисе:
deleteAsAdmin(user: AuthenticatedUser, id: string): Promise<void> {
    if (user.role !== 'admin') {
        throw new ForbiddenException('Admin only');
    }
    return this.db.collections.X.delete(id);
}
```

(Лучше — отдельный `AdminGuard`, см. `auth.md`. Но `throw new ForbiddenException(...)` в сервисе тоже валидно, если проверка вписана в логику.)

### «Конфликт бизнес-правила»

```ts
// Было
const existing = await userService.getByLogin(dto.login);
if (existing) {
    return err.conflict('Login already taken');
}

// Стало
async register(dto: RegisterDto) {
    const existing = this.findByLogin(dto.login);
    if (existing) {
        throw new ConflictException(`Login "${dto.login}" already taken`);
    }
    return this.createUser(dto);
}
```

### «Необработанная ошибка» (например, лопнул внешний API)

```ts
// Старое
throw error;

// Новое — то же самое
throw error;
```

Nest перехватит в глобальном exception filter, ответит 500. Если хочешь явно прокинуть свой статус — оборачивай:

```ts
try {
    return await externalApi.call();
} catch (error) {
    throw new BadGatewayException(`External API failed: ${(error as Error).message}`);
}
```

## Формат ответа об ошибке

Nest по умолчанию отдаёт:

```json
{
    "statusCode": 404,
    "message": "Order abc-123 not found",
    "error": "Not Found"
}
```

ZodValidationPipe при невалидном входе отдаёт:

```json
{
    "statusCode": 400,
    "message": "Validation failed",
    "errors": [
        { "code": "invalid_type", "path": ["login"], "message": "Required" }
    ]
}
```

Точный формат `nestjs-zod` может незначительно отличаться по версии — проверь вручную, если фронт начнёт это парсить.

Если позже потребуется унифицировать формат под старый `back` (`{ok: false, ...}`) — это делается одним глобальным `ExceptionFilter` в `main.ts`. Сейчас этого делать не надо.

## Правила

1. **Никаких `return err.*`** в `back-nest`. Только `throw new *Exception()`.
2. **`throw` в сервисе** для доменных условий («не найдено», «конфликт», «нельзя»).
3. **`throw` в контроллере** только для HTTP-семантики, которая не выражается через zod-валидацию (это редкий случай).
4. **Не глотай исключения** через `try/catch { /* ничего */ }`. Если ловишь — оборачивай в нужное `*Exception` с сохранением информации.
5. **Не используй `HttpException` напрямую без подкласса**, если есть подходящий: `BadRequestException`, `NotFoundException` и т.п. Они дают читаемый `error` в ответе.
6. **`message` исключений** — на русском, в стиле «что произошло», не «как исправить». Они уходят клиенту.

## Типичные грабли

- **Забыт `return` перед `err.X`** в старом коде — после миграции на `throw` это автоматически фиксится (throw прерывает выполнение).
- **`throw err.notFound(...)`** из `back/src/app/errors.ts` — это вернёт plain-object, не исключение. Нельзя. В `back-nest` `err.*` не существует; используй `throw new NotFoundException(...)`.
- **`throw 'строка'`** — нельзя. Только инстансы Error/HttpException.
- **`HttpException` без статуса** — конструктор требует `(response, status)`. Используй именованные подклассы, не базовый.
- **Локальные fallback-сообщения с `process.env.NODE_ENV === 'development'`** — нет необходимости. Nest сам решает, показывать ли stack trace.

## Живой пример

[back-nest/src/auth/auth.guard.ts](../../back-nest/src/auth/auth.guard.ts) — пример сразу нескольких исключений в одном классе:

```ts
if (payload === 'expired') {
    throw new UnauthorizedException('Access token expired');
}
if (payload === 'invalid') {
    throw new UnauthorizedException('Access token invalid');
}

const user = this.db.collections.users.getById(payload.sub);
if (!user) {
    throw new NotFoundException('User not found');
}
```

[back-nest/src/users/users.service.ts](../../back-nest/src/users/users.service.ts) — пример сервисного `throw`:

```ts
getPublicById(id: string): Stored<User> {
    const user = this.db.collections.users.getById(id);
    if (!user) {
        throw new NotFoundException(`User ${id} not found`);
    }
    // ...
}
```
