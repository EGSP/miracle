import type { ErrorRequestHandler } from 'express';
import { err } from '../app/index.js';

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    const message = error instanceof Error ? error.message : String(error);

    res.status(400).json(err.badRequest(message));
};
