# Типизированный роутинг

В этой папке лежит тонкий слой роутинга поверх Express. Хендлеры роутов не получают
Express `req` или `res`; они возвращают успешное JSON-значение или типизированную ошибку роута.

## Роут

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
        return err[400]('Login is required');
    }

    return {
        accessToken: 'token',
    } satisfies LoginResponse;
});
```

Middleware на уровне конкретного роута можно добавить через объектную форму:

```ts
export const loginRoute = route.post('/login', {
    middlewares: [],
    async handler({ body }: { body: LoginBody }) {
        return {
            accessToken: 'token',
        } satisfies LoginResponse;
    },
});
```

Генератор клиента должен выводить:

- входные данные запроса из первого аргумента хендлера;
- успешный ответ из `Exclude<Awaited<ReturnType<typeof handler>>, RouteError>`;
- ответы с ошибками из `Extract<Awaited<ReturnType<typeof handler>>, RouteError>`;
- middleware являются только runtime-логикой и должны игнорироваться генератором.

## Роутер

```ts
import { defineRouter } from '../app/index.js';
import { loginRoute } from './login.route.js';

export const authRouter = defineRouter('/auth', {
    middlewares: [],
    routes: [
        loginRoute,
    ],
});
```

Middleware на уровне роутера выполняются перед каждым роутом внутри этого роутера:

```ts
import { defineRouter } from '../app/index.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { profileRoute } from './profile.route.js';

export const profileRouter = defineRouter('/profile', {
    middlewares: [
        authMiddleware,
    ],
    routes: [
        profileRoute,
    ],
});
```

## Пример auth middleware

`authMiddleware` записывает `req.user`. Адаптер роутинга затем передает это значение
в контекст хендлера как `user`.

```ts
import type { User } from '@miracle/types';
import { err, route } from '../app/index.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

export const meRoute = route.get('/me', {
    middlewares: [
        authMiddleware,
    ],
    handler({ user }: { user?: User }) {
        if (!user) {
            return err[401]();
        }

        return user;
    },
});
```

Этот же middleware можно перенести в `defineRouter(..., { middlewares })`, если все
роуты внутри роутера требуют авторизацию.

Порядок выполнения в runtime:

```txt
глобальные Express middleware -> middleware роутера -> middleware роута -> хендлер роута
```

## Регистрация приложения

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

## Контракт генератора

Дерево роутов намеренно плоское:

- есть один корневой `defineApp([...])`;
- он содержит только роутеры верхнего уровня;
- роутеры объявляются в `src/routers`;
- роутеры не вкладываются в другие роутеры;
- порядок роутов определяется порядком элементов в массивах `defineApp` и `defineRouter`;
- пути должны быть строковыми литералами;
- middleware могут присутствовать, но не входят в контракт сгенерированного клиента.

Так runtime-регистрация и статическая генерация клиента остаются согласованными.
