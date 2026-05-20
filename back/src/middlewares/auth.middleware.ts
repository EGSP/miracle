import { SignJWT, jwtVerify, errors } from 'jose';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import type { AuthTokens, JwtPayload } from '@miracle/types';
import { serverConfig } from '../config.js';
import { userService } from '../databases/user.db.js';
import { err, mw } from '../app/index.js';
import { verifyToken } from '../databases/session.db.js';
import { TOKENS } from './tokensTools.js';

/**
 * @description Middleware аутентификации
 * @returns Ошибка маршрута или void
 */
export const authMiddleware = mw(async ({ cookies, locals }) => {
    const { accessToken } = TOKENS.extractFromCookies(cookies);
    const access = await verifyToken(accessToken, serverConfig.ACCESS_TOKEN_SECRET);

    if (access === 'expired') {
        return err.unauthorized('Access token expired');
    }
    if (access === 'invalid') {
        return err.unauthorized('Access token invalid');
    }

    const user = await userService.get(access.sub);

    if (!user) {
        return err.notFound('User not found');
    }

    locals.user = user;
});