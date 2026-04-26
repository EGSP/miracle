# Client generator idea

The generator can use `ts-morph` to read backend source files and produce a typed
frontend client.

## Source contract

Start from the root app definition:

```ts
const appDefinition = defineApp([
    healthRouter,
    authRouter,
]);
```

Each item must be a `defineRouter(prefix, routes)` result imported from `src/routers`.
Routers are one level deep and contain only `route.get/post/put/patch/delete` items.

## Extraction steps

1. Locate `defineApp([...])` in `src/index.ts`.
2. Resolve imported router symbols.
3. For each `defineRouter(prefix, [...routes])`, read the string literal prefix.
4. Resolve each route symbol in array order.
5. For each `route.method(path, handler)`, read:
   - HTTP method from the called property name;
   - path from the first argument;
   - request type from the handler's first parameter;
   - raw result type from `Awaited<ReturnType<typeof handler>>`.
6. Split the raw result type:
   - success: exclude `RouteError`;
   - errors: extract `RouteError`.
7. Join router prefix and route path into the final URL.

## Recommended generated shape

```ts
type ApiError = {
    ok: false;
    status: number;
    code: string;
    message: string;
    details?: unknown;
};

async function request<TResponse>(config: RequestConfig): Promise<TResponse> {
    // axios/fetch wrapper
}
```

Generated methods should expose only the success response type. Error bodies can be
exported as companion types for callers that want typed error handling.

## Constraints

- Prefer explicit object parameter annotations for handlers.
- Avoid dynamic route paths.
- Avoid inline anonymous routers in `defineApp`.
- Do not nest routers.
- Treat thrown exceptions as unexpected server errors, not typed API errors.
- Return `err[status](...)` for typed API errors.
