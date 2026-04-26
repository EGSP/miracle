# Typed routing

This folder contains a thin routing layer above Express. Route handlers do not receive
Express `req` or `res`; they return a successful JSON value or a typed route error.

## Route

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

The client generator should infer:

- request input from the handler's first argument;
- success response from `Exclude<Awaited<ReturnType<typeof handler>>, RouteError>`;
- error responses from `Extract<Awaited<ReturnType<typeof handler>>, RouteError>`.

## Router

```ts
import { defineRouter } from '../app/index.js';
import { loginRoute } from './login.route.js';

export const authRouter = defineRouter('/auth', [
    loginRoute,
]);
```

## App registration

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

## Generator contract

The route tree is intentionally shallow:

- there is one root `defineApp([...])`;
- it contains only top-level routers;
- routers are defined in `src/routers`;
- routers are not nested into other routers;
- route order is the array order inside `defineApp` and each `defineRouter`;
- paths should be string literals.

This keeps runtime registration and static client generation aligned.
