import express, { type Application, type Request, type RequestHandler, type Response } from 'express';
import { isRouteError, type RouteError } from './errors.js';
import { logger } from '../logger/logger.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type MaybePromise<T> = T | Promise<T>;

export type AppMiddleware = RequestHandler;

export type RouteContext = {
    req?: Request;
    res?: Response;
    params?: unknown;
    query?: unknown;
    body?: unknown;
    headers?: unknown;
    cookies?: unknown;
    locals?: Record<string, unknown>;
};

export type RouteHandler<TContext extends RouteContext = RouteContext, TResult = unknown> = (
    context: TContext,
) => MaybePromise<TResult>;

export type MiddlewareContext = RouteContext & {
    req: Request;
    res: Response;
    locals: Record<string, unknown>;
};

export type MiddlewareResult = void | RouteError;

export type MiddlewareHandler<TContext extends MiddlewareContext = MiddlewareContext> = (
    context: TContext,
) => MaybePromise<MiddlewareResult>;

export type AppRoute<
    TMethod extends HttpMethod = HttpMethod,
    TPath extends string = string,
    THandler extends RouteHandler = RouteHandler,
> = {
    kind: 'route';
    method: TMethod;
    path: TPath;
    middlewares: readonly AppMiddleware[];
    handler: THandler;
};

export type AnyRoute = AppRoute<HttpMethod, string, RouteHandler<any, any>>;

export type AppRouter<
    TPrefix extends string = string,
    TRoutes extends readonly AnyRoute[] = readonly AnyRoute[],
> = {
    kind: 'router';
    prefix: TPrefix;
    middlewares: readonly AppMiddleware[];
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

export type RouteOptions<THandler extends RouteHandler<any, any>> = {
    middlewares?: readonly AppMiddleware[];
    handler: THandler;
};

export type RouterOptions<TRoutes extends readonly AnyRoute[]> = {
    middlewares?: readonly AppMiddleware[];
    routes: TRoutes;
};

type RouteDefinition<THandler extends RouteHandler<any, any>> =
    | THandler
    | RouteOptions<THandler>;

function isRouterOptions<TRoutes extends readonly AnyRoute[]>(
    definition: TRoutes | RouterOptions<TRoutes>,
): definition is RouterOptions<TRoutes> {
    return !Array.isArray(definition);
}

function defineRoute<
    const TMethod extends HttpMethod,
    const TPath extends string,
    const THandler extends RouteHandler<any, any>,
>(
    method: TMethod,
    path: TPath,
    definition: RouteDefinition<THandler>,
): AppRoute<TMethod, TPath, THandler> {
    const handler = typeof definition === 'function'
        ? definition
        : definition.handler;
    const middlewares = typeof definition === 'function'
        ? []
        : definition.middlewares ?? [];

    return {
        kind: 'route',
        method,
        path,
        middlewares,
        handler,
    };
}

export const route = {
    get: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        definition: RouteDefinition<THandler>,
    ) => defineRoute('get', path, definition),
    post: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        definition: RouteDefinition<THandler>,
    ) => defineRoute('post', path, definition),
    put: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        definition: RouteDefinition<THandler>,
    ) => defineRoute('put', path, definition),
    patch: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        definition: RouteDefinition<THandler>,
    ) => defineRoute('patch', path, definition),
    delete: <const TPath extends string, const THandler extends RouteHandler<any, any>>(
        path: TPath,
        definition: RouteDefinition<THandler>,
    ) => defineRoute('delete', path, definition),
};

export function defineRouter<
    const TPrefix extends string,
    const TRoutes extends readonly AnyRoute[],
>(prefix: TPrefix, definition: TRoutes | RouterOptions<TRoutes>): AppRouter<TPrefix, TRoutes> {
    const routes = isRouterOptions(definition)
        ? definition.routes
        : definition;
    const middlewares = isRouterOptions(definition)
        ? definition.middlewares ?? []
        : [];

    return {
        kind: 'router',
        prefix,
        middlewares,
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

export function mw<TContext extends MiddlewareContext>(
    handler: MiddlewareHandler<TContext>,
): RequestHandler {
    return async (req, res, next) => {
        try {
            const result = await handler(createRequestContext(req, res) as TContext);

            if (isRouteError(result)) {
                res.status(result.status).json(result);
                return;
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function registerApp(app: Application, definition: AppDefinition): void {
    definition.routers.forEach((routerDefinition) => {
        const router = express.Router();

        if (routerDefinition.middlewares.length > 0) {
            router.use(...routerDefinition.middlewares);
        }

        routerDefinition.routes.forEach((routeDefinition) => {
            router[routeDefinition.method](
                routeDefinition.path,
                ...routeDefinition.middlewares,
                createRequestHandler(routeDefinition),
            );
        });

        app.use(routerDefinition.prefix, router);
    });
}

function createRequestHandler(routeDefinition: AnyRoute): RequestHandler {
    return async (req, res, next) => {
        try {
            const result = await routeDefinition.handler(createRequestContext(req, res));

            if (isRouteError(result)) {
                res.status(result.status).json(result);
                logger.http(`${req.method} ${req.originalUrl} -> ${result.status} (${result.code})`);
                return;
            }

            res.json(result ?? null);
            logger.http(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
        } catch (error) {
            next(error);
        }
    };
}

function createRequestContext(req: Request, res: Response): MiddlewareContext {
    const request = req as typeof req & {
        cookies?: unknown;
    };

    return {
        req,
        res,
        params: request.params,
        query: request.query,
        body: request.body,
        headers: request.headers,
        cookies: request.cookies,
        locals: res.locals,
    };
}
