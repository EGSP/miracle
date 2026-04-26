# Типизированный роутинг

В этой папке лежит тонкий серверный слой поверх Express. Роуты и custom middleware
обычно не отправляют ответ через `req`, `res` и `next` напрямую. Вместо этого они
получают общий контекст и возвращают либо успешное значение, либо типизированную
ошибку `err[...]`.

## Оглавление

- [1. Основная Идея](#1-основная-идея)
- [2. Контекст Хендлера](#2-контекст-хендлера)
- [3. Ошибки](#3-ошибки)
- [4. Первый Роут](#4-первый-роут)
- [5. Custom Middleware](#5-custom-middleware)
- [6. Locals](#6-locals)
- [7. Middleware На Роуте](#7-middleware-на-роуте)
- [8. Middleware На Роутере](#8-middleware-на-роутере)
- [9. Auth Пример](#9-auth-пример)
- [10. Порядок Выполнения](#10-порядок-выполнения)
- [11. Регистрация Приложения](#11-регистрация-приложения)
- [12. Контракт Структуры](#12-контракт-структуры)

## 1. Основная Идея

Роут возвращает JSON-значение:

```ts
return {
    status: 'ok',
};
```

Роут или middleware возвращает ошибку:

```ts
return err.unauthorized('Unauthorized');
```

Routing layer сам отправит ответ:

```json
{
    "ok": false,
    "status": 401,
    "code": "unauthorized",
    "message": "Unauthorized"
}
```

## 2. Контекст Хендлера

В хендлеры передается объект с данными запроса:

```ts
type RouteContext = {
    req?: Request;
    res?: Response;
    params?: unknown;
    query?: unknown;
    body?: unknown;
    headers?: unknown;
    cookies?: unknown;
    locals?: Record<string, unknown>;
};
```

`req` и `res` — оригинальные Express объекты. Они нужны для низкоуровневых
операций, которые не выражаются обычным JSON-ответом: установить cookie, добавить
header, прочитать нестандартные поля запроса.

`locals` используется для данных, которые middleware передают следующим middleware
и роуту. Например: `user`, `tenant`, `permissions`, `locale`.

## 3. Ошибки

Для ожидаемых ошибок используется `err`:

```ts
return err.badRequest('Login is required');
return err.unauthorized('Unauthorized');
return err.notFound('User not found');
```

Рекомендуемый стиль — использовать именованные helpers: `err.badRequest`,
`err.unauthorized`, `err.forbidden`, `err.notFound`, `err.conflict`,
`err.validation`, `err.internal`.

Форма `err[400]`, `err[401]`, `err[404]` тоже доступна, но ее лучше оставлять для
случаев, когда удобнее работать именно со статусом.

Такой результат не нужно отправлять вручную через `res.status().json()`. Routing
layer сам определит статус и отправит JSON-ответ.

### Ожидаемые ошибки

Ожидаемая ошибка — это нормальный исход запроса: нет токена, не хватает прав,
пользователь не найден, данные не прошли проверку.

В таких случаях нужно возвращать именованную ошибку:

```ts
if (!body.login) {
    return err.badRequest('Login is required');
}

if (!locals.user) {
    return err.unauthorized();
}

const user = userDb.getById(id);

if (!user) {
    return err.notFound('User not found');
}
```

Именованные ошибки можно использовать и в route handler, и в custom middleware:

```ts
export const requireToken = mw(({ cookies }) => {
    const cookieRecord = cookies as { accessToken?: string } | undefined;

    if (!cookieRecord?.accessToken) {
        return err.unauthorized('No token provided');
    }
});
```

### Неожиданные ошибки

Неожиданная ошибка — это сбой, который не является частью обычного сценария:
сломалась база, упал внешний сервис, пришло исключение из библиотеки.

Такие ошибки не нужно заворачивать в `err.internal()` на месте. Их можно просто бросить:

```ts
throw error;
```

Wrapper передаст такую ошибку в Express через `next(error)`.

### Что Не Нужно Делать

В typed route handler и custom middleware не нужно вручную отправлять обычный JSON
response:

```ts
// Не нужно
res.status(401).json(err.unauthorized());
```

Но `res` можно использовать для побочных эффектов ответа, например для cookies:

```ts
res.cookie('accessToken', accessToken, {
    httpOnly: true,
});
```

Также не нужно бросать `err[...]` как исключение:

```ts
// Не нужно
throw err.unauthorized();
```

`err` — это возвращаемый результат, а не exception.

### Поведение

В route handler и custom middleware правила одинаковые:

- `return err.unauthorized()` или другая `err.*` отправляет JSON-ошибку и останавливает текущую цепочку;
- `return undefined` в middleware продолжает выполнение через `next()`;
- `throw error` передает неожиданную ошибку в Express через `next(error)`.

## 4. Первый Роут

Минимальный роут создается через `route.get/post/put/patch/delete`.

```ts
import { err, route } from '../app/index.js';

type LoginBody = {
    login: string;
    password: string;
};

type LoginResponse = {
    accessToken: string;
};

export const loginRoute = route.post('/login', async ({ body }: { body: LoginBody }) => {
    if (!body.login) {
        return err.badRequest('Login is required');
    }

    return {
        accessToken: 'token',
    } satisfies LoginResponse;
});
```

Хендлер получает общий контекст. В большинстве случаев достаточно `body`, `query`,
`params`, `cookies` и `locals`, а `req`/`res` используются только когда нужен
доступ к Express API.

## 5. Custom Middleware

Для middleware используется helper `mw`. Он принимает typed handler и возвращает
обычный Express `RequestHandler`, поэтому его можно использовать в `middlewares`.

```ts
import { err, mw } from '../app/index.js';

export const requireToken = mw(({ cookies }) => {
    const cookieRecord = cookies as { accessToken?: string } | undefined;

    if (!cookieRecord?.accessToken) {
        return err.unauthorized('No token provided');
    }
});
```

Если middleware ничего не вернул, выполнение продолжается дальше.

## 6. Locals

`locals` нужен для передачи серверных данных между middleware и route handler.
Например, middleware может найти tenant:

```ts
import { mw } from '../app/index.js';

export const tenantMiddleware = mw(({ locals }) => {
    locals.tenant = {
        id: 'tenant-id',
    };
});
```

А роут потом описывает только нужную ему форму `locals`:

```ts
route.get('/tenant', {
    middlewares: [
        tenantMiddleware,
    ],
    handler({ locals }: { locals: { tenant: { id: string } } }) {
        return {
            tenantId: locals.tenant.id,
        };
    },
});
```

## 7. Middleware На Роуте

Middleware на уровне конкретного роута добавляются через объектную форму:

```ts
export const privateRoute = route.get('/private', {
    middlewares: [
        requireToken,
    ],
    handler() {
        return {
            ok: true,
        };
    },
});
```

## 8. Middleware На Роутере

Роутер создается через `defineRouter(prefix, definition)`.

```ts
import { defineRouter } from '../app/index.js';
import { privateRoute } from './private.route.js';

export const privateRouter = defineRouter('/private', {
    middlewares: [
        requireToken,
    ],
    routes: [
        privateRoute,
    ],
});
```

Middleware на уровне роутера выполняются перед каждым роутом внутри этого роутера.

Если middleware нужен только одному endpoint-у, лучше положить его на route. Если
middleware нужен всем endpoint-ам группы, лучше положить его на router.

## 9. Auth Пример

`authMiddleware` проверяет токен, находит пользователя и записывает его в
`locals.user`. Роут после этого может прочитать пользователя из `locals`.

```ts
import type { User } from '@miracle/types';
import { err, route } from '../app/index.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

export const meRoute = route.get('/me', {
    middlewares: [
        authMiddleware,
    ],
    handler({ locals }: { locals: { user?: User } }) {
        const { user } = locals;

        if (!user) {
            return err.unauthorized();
        }

        return user;
    },
});
```

Этот же middleware можно перенести в `defineRouter(..., { middlewares })`, если все
роуты внутри роутера требуют авторизацию.

## 10. Порядок Выполнения

```txt
глобальные Express middleware -> middleware роутера -> middleware роута -> хендлер роута
```

Если любой custom middleware вернул `err[...]`, следующие middleware и хендлер
роута не выполняются.

## 11. Регистрация Приложения

В `index.ts` создается Express app, настраиваются глобальные Express middleware и
регистрируется typed app definition.

```ts
import express from 'express';
import { defineApp, registerApp } from './app/index.js';
import { authRouter } from './routers/auth.router.js';

const app = express();
const appDefinition = defineApp([
    authRouter,
]);

registerApp(app, appDefinition);
```

## 12. Контракт Структуры

Дерево роутов намеренно плоское:

- есть один корневой `defineApp([...])`;
- он содержит только роутеры верхнего уровня;
- роутеры объявляются в `src/routers`;
- роутеры не вкладываются в другие роутеры;
- порядок роутов определяется порядком элементов в массивах `defineApp` и `defineRouter`;
- пути должны быть строковыми литералами.
