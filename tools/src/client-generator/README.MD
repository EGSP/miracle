# Генератор клиента

Генерирует типизированные frontend-клиенты из backend-контракта typed-routing.

Генератор читает корневой `defineApp([...])`, резолвит роутеры верхнего уровня из
`back/src/routers`, извлекает метаданные маршрутов через `ts-morph` и записывает
клиенты в `front/src/lib/generated`.

## Runtime-контракт

Сгенерированные функции используют Orval-style custom instance:

```ts
customInstance<T>(config): Promise<T>
```

Frontend сам определяет эту функцию, обычно в `front/src/lib/api.ts`. Так axios
interceptors, base URL, auth headers и обработка ошибок остаются ручным кодом.

## Конфиг

Путь к конфигу по умолчанию:

```txt
front/src/lib/client-generator.config.ts
```

Пример:

```ts
export default {
    input: '../../../back/src/index.ts',
    output: './generated',
    customInstance: './api',
};
```

Все пути резолвятся относительно файла конфига.

## Сгенерированные файлы

Для backend-роутера `health.router.ts` генератор пишет:

```txt
front/src/lib/generated/health.client.ts
front/src/lib/generated/models/health.models.ts
```

Клиент экспортируется одним объектом на роутер:

```ts
import { health } from '@/lib/generated';

const result = await health.checkHealth();
```

## Требования к backend

- `back/src/index.ts` содержит один `defineApp([...])`.
- Массив app содержит переменные роутеров верхнего уровня.
- Роутеры создаются через `defineRouter(prefix, [...routes])` или `defineRouter(prefix, { routes })`.
- Маршруты создаются через `route.get/post/put/patch/delete(path, handler)` или `route.method(path, { handler })`.
- Массивы роутеров и маршрутов должны быть литералами.
- Пути должны быть строковыми литералами.
- Имена route-переменных становятся именами методов клиента.
- Типизированные API-ошибки нужно возвращать через `err.badRequest`, `err.unauthorized`, `err.notFound` и другие helpers; `throw` считается неожиданной серверной ошибкой.

## Что Считается Client Request

Генератор читает первый аргумент route handler-а, но в client-функцию превращает
только публичные HTTP-поля:

- `params` — path params, подставляется в `/:param`;
- `query` — query params, попадает в `params`;
- `body` — тело запроса, попадает в `data`.

Аргументы client-функции генерируются явно, без wrapper-типа вроде
`LoginRequest`. Порядок аргументов фиксированный:

```txt
params -> query -> body
```

Если поле имеет именованный тип, имя аргумента строится из имени типа:

- `body: LoginDTO` -> `loginDTO`;
- `body: RegisterDTO` -> `registerDTO`;
- `query: UserFilterDTO` -> `userFilterDTO`;
- `params: TaskParams` -> `taskParams`.

Если тип inline, используется fallback по имени поля: `params`, `query` или `body`.

Серверные поля не попадают в модели и client-функции:

- `req`;
- `res`;
- `cookies`;
- `headers`;
- `locals`.

Например backend handler:

```ts
type LoginDTO = {
    login: string;
    password: string;
};

const login = route.post('/login', async ({
    body,
    res,
}: {
    body: LoginDTO;
    res: Response;
}) => {
    // res нужен только серверу, например для установки cookies.
    return { status: 'success' } satisfies LoginResponse;
});
```

Даст client-функцию с одним явным аргументом:

```ts
login: (loginDTO: LoginDTO) => customInstance<LoginResponse>({
    method: 'POST',
    url: '/auth/login',
    data: loginDTO,
});
```

Для маршрута с несколькими публичными частями запроса:

```ts
type TaskParams = {
    id: string;
};

type TaskFilterDTO = {
    includeDone?: boolean;
};

const getTask = route.get('/tasks/:id', async ({
    params,
    query,
}: {
    params: TaskParams;
    query: TaskFilterDTO;
}) => {
    return { status: 'success' } satisfies TaskResponse;
});
```

Клиент будет сгенерирован так:

```ts
getTask: (taskParams: TaskParams, taskFilterDTO: TaskFilterDTO) => customInstance<TaskResponse>({
    method: 'GET',
    url: formatPath('/tasks/:id', taskParams),
    params: taskFilterDTO,
});
```

Если handler использует только server-side cookies:

```ts
const refreshTokens = route.post('/refresh-tokens', async ({ cookies, res }) => {
    // cookies и res не являются client request.
    return { status: 'success' } satisfies RefreshTokensResponse;
});
```

То client method будет без аргументов:

```ts
refreshTokens: () => customInstance<RefreshTokensResponse>({
    method: 'POST',
    url: '/auth/refresh-tokens',
});
```

## Модели

Генератор пишет модели в `generated/models`. В router-specific model-файл попадают
только локальные `type`, `interface` и `enum`, которые реально используются
сгенерированными аргументами client-функций и response-типами.

Серверные imports из router-файла не копируются во frontend. Например `Response`
из `express`, сервисы, базы данных, middleware helpers и другие backend-only
зависимости не должны появляться в `generated/models`.

Если response уже является именованным типом, например `HealthResponse`, клиент
использует его напрямую и не создает лишний alias вроде `CheckHealthResponse`.

Общие backend-local типы, которые роутеры импортируют из относительных backend-файлов,
попадают в `generated/models/common.models.ts`. Генератор рекурсивно подтягивает
их зависимости, если эти зависимости тоже объявлены в backend-local файлах.

Типы из общих пакетов, например `@miracle/types`, не копируются. Файлы моделей
сохраняют import и добавляют type re-export, чтобы client-файлы могли импортировать
все публичные типы из `./models`.

Клиенты всегда импортируют модели из barrel-файла:

```ts
import type { HealthResponse, UserDto } from './models';
```

Это скрывает от клиентского кода, где именно лежит модель: в router-specific
файле, `common.models.ts` или общем workspace-пакете.

## CLI

```bash
npm run generate:client --workspace=tools
```

Можно передать путь к конфигу:

```bash
npm run generate:client --workspace=tools -- ../front/src/lib/client-generator.config.ts
```
