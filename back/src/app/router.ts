import express, { type Application, type RequestHandler } from 'express';
import { isRouteError, type RouteError } from './errors.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type MaybePromise<T> = T | Promise<T>;

export type RouteContext = {
    params?: unknown;
    query?: unknown;
    body?: unknown;
    headers?: unknown;
    cookies?: unknown;
    user?: unknown;
};

export type RouteHandler<TContext extends RouteContext = RouteContext, TResult = unknown> = (
    context: TContext,
) => MaybePromise<TResult>;

export type AppRoute<
    TMethod extends HttpMethod = HttpMethod,
    TPath extends string = string,
    THandler extends RouteHandler = RouteHandler,
> = {
    kind: 'route';
    method: TMethod;
    path: TPath;
    handler: THandler;
};

export type AnyRoute = AppRoute<HttpMethod, string, RouteHandler<any, any>>;

export type AppRouter<
    TPrefix extends string = string,
    TRoutes extends readonly AnyRoute[] = readonly AnyRoute[],
> = {
    kind: 'router';
    prefix: TPrefix;
    routes: TRoutes;
};

export type AnyRouter = AppRouter<string, readonly AnyRoute[]>;

export type AppDefinition<TRouters extends readonly AnyRouter[] = readonly AnyRouter[]> = {
    kind: 'app';
    routers: TRouters;
};

export type RouteInput<TRoute extends AnyRoute> = Parameters<TRoute['handler']>[0];

export type RouteResult<TRoute extends AnyRoute> = Awaited<ReturnType<TRoute['handler']>>;

export type RouteSuccess<TRoute extends AnyRoute> = Exclude<RouteResult<TRoute>, RouteError>;

export type RouteFailure<TRoute extends AnyRoute> = Extract<RouteResult<TRoute>, RouteError>;

function defineRoute<
    const TMethod extends HttpMethod,
    const TPath extends string,
    const THandler extends RouteHandler<any, any>,
>(method: TMethod, path: TPath, handler: THandler): AppRoute<TMethod, TPath, THandler> {
    return {
        kind: 'route',
        method,
        path,
        handler,
    };
}

export const route = {
    get: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        handler: THandler,
    ) => defineRoute('get', path, handler),
    post: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        handler: THandler,
    ) => defineRoute('post', path, handler),
    put: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        handler: THandler,
    ) => defineRoute('put', path, handler),
    patch: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        handler: THandler,
    ) => defineRoute('patch', path, handler),
    delete: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        handler: THandler,
    ) => defineRoute('delete', path, handler),
};

export function defineRouter<
    const TPrefix extends string,
    const TRoutes extends readonly AnyRoute[],
>(prefix: TPrefix, routes: TRoutes): AppRouter<TPrefix, TRoutes> {
    return {
        kind: 'router',
        prefix,
        routes,
    };
}

export function defineApp<const TRouters extends readonly AnyRouter[]>(
    routers: TRouters,
): AppDefinition<TRouters> {
    return {
        kind: 'app',
        routers,
    };
}

export function registerApp(app: Application, definition: AppDefinition): void {
    definition.routers.forEach((routerDefinition) => {
        const router = express.Router();

        routerDefinition.routes.forEach((routeDefinition) => {
            router[routeDefinition.method](routeDefinition.path, createRequestHandler(routeDefinition));
        });

        app.use(routerDefinition.prefix, router);
    });
}

function createRequestHandler(routeDefinition: AnyRoute): RequestHandler {
    return async (req, res, next) => {
        try {
            const request = req as typeof req & {
                cookies?: unknown;
                user?: unknown;
            };

            const result = await routeDefinition.handler({
                params: request.params,
                query: request.query,
                body: request.body,
                headers: request.headers,
                cookies: request.cookies,
                user: request.user,
            });

            if (isRouteError(result)) {
                res.status(result.status).json(result);
                return;
            }

            res.json(result ?? null);
        } catch (error) {
            next(error);
        }
    };
}
