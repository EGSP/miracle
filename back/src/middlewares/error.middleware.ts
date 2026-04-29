import type { ErrorRequestHandler } from 'express';
import { err, isRouteError } from '../app/index.js';
import { logger } from '../logger/logger.js';

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    if (isRouteError(error)) {
        logger.warn(`[${error.status}] ${error.code}: ${error.message}`);
        res.status(error.status).json(error);
        return;
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error(message, error instanceof Error ? { stack: error.stack } : undefined);
    res.status(500).json(err.internal(message));
};
