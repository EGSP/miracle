import { SignJWT, jwtVerify, errors } from 'jose';
import argon2 from 'argon2';
import type { Request, Response, NextFunction } from 'express';
import type { AuthTokens, JwtPayload, User } from '@miracle/types';
import { serverConfig } from '../config.js';
import { userDb } from '../databases/user.db.js';

/**
 * @description Middleware for authentication
 * @param req Request
 * @param res Response
 * @param next Next function
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const token = TOKENS.extract(req);

    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    try {
        const payload = await verifyAccessToken(token);
        req.user = userDb.getById(payload.sub);

        if (!req.user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        next();
    } catch (err) {
        if (err instanceof errors.JWTExpired) {
            res.status(401).json({ error: 'Token expired' });
            return;
        }
        if (err instanceof errors.JWTInvalid || err instanceof errors.JWSInvalid) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        next(err);
    }
};

async function signTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<AuthTokens> {
    const accessToken = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(serverConfig.ACCESS_TOKEN_LIFETIME)
        .sign(new TextEncoder().encode(serverConfig.ACCESS_TOKEN_SECRET));

    const refreshToken = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(serverConfig.REFRESH_TOKEN_LIFETIME)
        .sign(new TextEncoder().encode(serverConfig.REFRESH_TOKEN_SECRET));

    return { accessToken, refreshToken };
}

/**
 * Проверяет access токен
 * @param token 
 * @returns 
 */
async function verifyAccessToken(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(serverConfig.ACCESS_TOKEN_SECRET));
    return payload as JwtPayload;
}

declare module 'express-serve-static-core' {
    interface Request {
        user?: User;
    }
}


const PASSWORD = {
    hash: async (password: string): Promise<string> => {
        return await argon2.hash(password);
    },
    verify: async (password: string, hashedPassword: string): Promise<boolean> => {
        return await argon2.verify(hashedPassword, password);
    }
}

const TOKENS = {
    /**
     * Вытаскивает access токен из cookies или headers
     * @param req 
     * @returns 
     */
    extract(req: Request): string | undefined {
        return (
            req.cookies?.accessToken ??
            req.headers.authorization?.replace(/^Bearer\s+/, '') ??
            undefined
        );
    },

    /**
     * Устанавливает access и refresh токены в cookies
     * @param res 
     * @param tokens 
     */
    setCookies(res: Response, tokens: AuthTokens): void {
        res.cookie('accessToken', tokens.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: parseInt(serverConfig.ACCESS_TOKEN_LIFETIME) * 1000,
        });
        if (tokens.refreshToken) {
            res.cookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: parseInt(serverConfig.REFRESH_TOKEN_LIFETIME) * 1000,
            });
        }
    },

    /**
     * Очищает access и refresh токены из cookies
     * @param res 
     */
    clearCookies(res: Response): void {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
    }
};