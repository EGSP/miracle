import express, { type Application, type Request, type RequestHandler, type Response } from 'express';
import { err, isRouteError, ParseError, type RouteError } from './errors.js';
import { logger } from '../logger/logger.js';
import { validationMap } from './generated/validation-map.generated.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type MaybePromise<T> = T | Promise<T>;

export type AppMiddleware = RequestHandler;

export type RouteValidationOptions = {
    query?: boolean;
    params?: boolean;
};

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
    validate: RouteValidationOptions;
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
    validate: RouteValidationOptions;
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
    validate?: RouteValidationOptions;
    handler: THandler;
};

export type RouterOptions<TRoutes extends readonly AnyRoute[]> = {
    middlewares?: readonly AppMiddleware[];
    validate?: RouteValidationOptions;
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
    const validate = typeof definition === 'function'
        ? {}
        : definition.validate ?? {};

    return {
        kind: 'route',
        method,
        path,
        middlewares,
        validate,
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
    const validate = isRouterOptions(definition)
        ? definition.validate ?? {}
        : {};

    return {
        kind: 'router',
        prefix,
        middlewares,
        validate,
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
            const validationKey = getValidationKey(routerDefinition.prefix, routeDefinition);

            router[routeDefinition.method](
                routeDefinition.path,
                ...routeDefinition.middlewares,
                createRequestHandler(routeDefinition, validationKey),
            );
        });

        app.use(routerDefinition.prefix, router);
    });
}

function createRequestHandler(routeDefinition: AnyRoute, validationKey: string): RequestHandler {
    return async (req, res, next) => {
        try {
            const context = createRequestContext(req, res);
            const validators = validationMap[validationKey];

            try {
                context.query = validators?.query ? validators.query(req.query) : req.query;
                context.params = validators?.params ? validators.params(req.params) : req.params;
            } catch (error) {
                if (error instanceof ParseError) {
                    const result = errValidation(error);
                    res.status(result.status).json(result);
                    logger.http(
                        `${req.method} ${req.originalUrl} -> ${result.status} (${result.code}): ${result.message}`,
                    );
                    return;
                }

                throw error;
            }

            const result = await routeDefinition.handler(context);

            if (res.headersSent) {
                logger.http(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
                return;
            }

            if (isRouteError(result)) {
                res.status(result.status).json(result);
                logger.http(`${req.method} ${req.originalUrl} -> ${result.status} (${result.code}): ${result.message}`);
                return;
            }

            res.json(result ?? null);
            logger.http(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`${req.method} ${req.originalUrl} -> 500: ${message}`);
            next(error);
        }
    };
}

function getValidationKey(prefix: string, routeDefinition: AnyRoute): string {
    return `${routeDefinition.method.toUpperCase()} ${normalizeUrl(prefix, routeDefinition.path)}`;
}

function normalizeUrl(...parts: string[]): string {
    const joined = parts
        .filter((part) => part.length > 0 && part !== '/')
        .map((part) => part.replace(/^\/+|\/+$/gu, ''))
        .filter(Boolean)
        .join('/');

    return `/${joined}`;
}

function errValidation(error: ParseError) {
    return err.validation('Validation failed', { details: error.errors });
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
