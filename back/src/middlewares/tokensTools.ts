import { SignJWT, jwtVerify, errors } from 'jose';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import type { AuthTokens, JwtPayload, NewAuthTokens } from '@miracle/types';
import { serverConfig } from '../config.js';

export async function signTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<NewAuthTokens> {
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

export const PASSWORD = {
    hash: async (password: string): Promise<string> => {
        return await argon2.hash(password);
    },
    verify: async (password: string, hashedPassword: string): Promise<boolean> => {
        return await argon2.verify(hashedPassword, password);
    }
}

export const TOKENS = {
    /**
     * Вытаскивает access и refresh токены из cookies
     * @param req 
     * @returns 
     */
    extract(req: Request): AuthTokens {
        return {
            accessToken: req.cookies?.accessToken ?? undefined,
            refreshToken: req.cookies?.refreshToken ?? undefined,
        };
    },

    extractFromCookies(cookies: unknown): AuthTokens {
        const cookieRecord = cookies as Partial<Record<'accessToken' | 'refreshToken', string>> | undefined;

        return {
            accessToken: cookieRecord?.accessToken,
            refreshToken: cookieRecord?.refreshToken,
        };
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