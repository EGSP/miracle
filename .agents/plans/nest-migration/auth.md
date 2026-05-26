# Паттерн: аутентификация (AuthGuard + CurrentUser)

## Когда применять

Эндпоинт должен быть доступен **только** аутентифицированным пользователям. В старом `back` это выражалось через `middlewares: [authMiddleware]` на роуте или роутере; в `back-nest` — через `@UseGuards(AuthGuard)` + `@CurrentUser()`.

## Контекст

Логика верификации полностью повторяет старый `back`:

1. Из `request.cookies.accessToken` достаётся JWT.
2. Через `jose.jwtVerify` проверяется подпись (секрет — `ACCESS_TOKEN_SECRET` из env).
3. По `payload.sub` достаётся пользователь из `DatabaseService.collections.users`.
4. Если всё ок — на `request` навешивается `user` (без поля `password`), guard пропускает.
5. Любая ошибка — `UnauthorizedException` (или `NotFoundException` если user удалён).

Реализация — [back-nest/src/auth/auth.guard.ts](../../back-nest/src/auth/auth.guard.ts) и [back-nest/src/auth/tokens.service.ts](../../back-nest/src/auth/tokens.service.ts).

Канонический пример использования — [back-nest/src/users/users.controller.ts](../../back-nest/src/users/users.controller.ts).

## Что НЕ в скоупе

Этот паттерн описывает **только использование** уже работающего AuthGuard. Сам auth-флоу (`POST /auth/login`, `/register`, `/refresh`, `/logout`) пока не мигрирован — это будет отдельный домен `back-nest/src/auth-flow/` (или внутри `auth/`) в следующей фазе. Если твоя задача — перенести login/register, **остановись и поднимай вопрос с пользователем**; этот паттерн не покрывает выпуск токенов.

## Применение к контроллеру

### Защитить весь контроллер

Если ВСЕ эндпоинты контроллера требуют auth — навешивай гард на класс:

```ts
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
    @Get(':id')
    getOne(@Param('id') id: string) { /* ... */ }

    @Post('create')
    create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) { /* ... */ }
}
```

### Защитить отдельный метод

Если только некоторые эндпоинты требуют auth:

```ts
@Controller('users')
export class UsersController {
    @Get(':id')              // ← публичный, без guard
    getOne(@Param('id') id: string) { /* ... */ }

    @Get('me')
    @UseGuards(AuthGuard)    // ← защищён
    getMe(@CurrentUser() user: AuthenticatedUser) { /* ... */ }
}
```

### Обязательно — импорт `AuthModule`

Чтобы Nest смог резолвить `AuthGuard`, в модуле контроллера нужно импортировать `AuthModule`:

```ts
// orders.module.ts
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { AuthModule } from '../auth/auth.module.js';   // ← обязательно

@Module({
    imports: [AuthModule],          // ← обязательно
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule {}
```

Без этого — runtime ошибка про unresolved provider `AuthGuard`.

## Получение пользователя в handler-е

```ts
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';

@Get('me')
@UseGuards(AuthGuard)
getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getPublicById(user.id);
}
```

`AuthenticatedUser` — это `StoredEntity<User>` (то есть с гарантированными `id`, `createdAt`, `updatedAt`) **без** поля `password`. Guard гарантирует, что значение существует — то есть `user.id` всегда `string`, не `string | undefined`.

## Ответы клиенту

`AuthGuard` бросает следующие исключения (это контракт для фронта):

| Сценарий | Исключение | HTTP |
|---|---|---|
| Нет cookie `accessToken` | `UnauthorizedException('Access token invalid')` | 401 |
| Токен подделан / неверная подпись | `UnauthorizedException('Access token invalid')` | 401 |
| Токен истёк | `UnauthorizedException('Access token expired')` | 401 |
| Токен валиден, но user удалён | `NotFoundException('User not found')` | 404 |

Если у фронта была разная логика на «токен истёк» vs «токен подделан» — оба теперь дают 401, но с разным `message`. Фронт может различать по строке (как и раньше).

## Что guard кладёт в request

```ts
(req as FastifyRequest & { user?: AuthenticatedUser }).user = publicUser;
```

То есть `req.user` — это `AuthenticatedUser` (без password). Доступен через `@CurrentUser()`, либо напрямую через `@Req() req: FastifyRequest`.

## Правила

1. **Не пиши свой `@Injectable` guard** для тривиальной проверки токена — используй существующий `AuthGuard`.
2. **`@UseGuards(AuthGuard)` без `imports: [AuthModule]`** — runtime ошибка. Всегда импортируй модуль.
3. **Не доставай `accessToken` руками из `req.cookies`** в контроллере — это работа guard'а. Если думаешь, что нужно — почти наверняка ты пишешь логин/рефреш, и тебе нужен **другой** код (см. «Что НЕ в скоупе»).
4. **`@CurrentUser()` валиден только после `@UseGuards(AuthGuard)`** на том же методе или классе. Иначе `req.user` будет `undefined` и упадёт runtime-ошибка при попытке доступа к `.id`.
5. **Не сохраняй `user` в полях контроллера/сервиса.** Каждый запрос — новый user. Передавай явно.

## Дополнительные проверки (роли, права)

Если нужна проверка роли — пиши **дополнительный** guard поверх `AuthGuard`:

```ts
// auth/admin.guard.ts (когда понадобится)
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
        const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
        if (!user) throw new UnauthorizedException();
        if (user.role !== 'admin') throw new ForbiddenException();
        return true;
    }
}

// usage
@UseGuards(AuthGuard, AdminGuard)
@Get('/secret')
secret() { ... }
```

Порядок в `@UseGuards(...)` важен — guards вызываются слева направо. AuthGuard первым (он заполняет `req.user`), потом проверяющие.

## Типичные грабли

- **`AuthModule` не импортирован в модуль контроллера** → `Nest can't resolve dependencies of the AuthGuard`. Самая частая ошибка.
- **`@CurrentUser()` без `@UseGuards(AuthGuard)`** → `user.id` бросит `TypeError: Cannot read properties of undefined`. Не забывай оба.
- **Использовал `@Headers('cookie')` для парсинга** — не делай. Cookies парсятся плагином `@fastify/cookie` глобально, доступны через `request.cookies`.
- **Попытка передать `accessToken` в URL/query** — не поддерживается guard'ом. Только cookie. Это намеренное решение (соответствует старому `back`).

## Живой пример

[back-nest/src/users/users.controller.ts](../../back-nest/src/users/users.controller.ts):

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

И его модуль [back-nest/src/users/users.module.ts](../../back-nest/src/users/users.module.ts):

```ts
@Module({
    imports: [AuthModule],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule {}
```
