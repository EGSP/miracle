import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { SignJWT, jwtVerify, errors } from 'jose';
import type { FastifyReply } from 'fastify';
import type { AuthTokens, JwtPayload, NewAuthTokens } from '@miracle/types';
import { AppConfigService } from '../config/app-config.service.js';

export type VerifyResult = JwtPayload | 'expired' | 'invalid';

@Injectable()
export class TokensService {
    constructor(private readonly config: AppConfigService) {}

    async verifyAccessToken(token: string | undefined): Promise<VerifyResult> {
        return this.verifyToken(token, this.config.accessTokenSecret);
    }

    async signTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<NewAuthTokens> {
        const accessSecret = new TextEncoder().encode(this.config.accessTokenSecret);
        const refreshSecret = new TextEncoder().encode(this.config.refreshTokenSecret);

        const accessToken = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(this.config.accessTokenLifetime)
            .sign(accessSecret);

        const refreshToken = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(this.config.refreshTokenLifetime)
            .sign(refreshSecret);

        return { accessToken, refreshToken };
    }

    async hashPassword(password: string): Promise<string> {
        return argon2.hash(password);
    }

    async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
        return argon2.verify(hashedPassword, password);
    }

    extractFromCookies(
        cookies: Partial<Record<'accessToken' | 'refreshToken', string>> | undefined,
    ): AuthTokens {
        return {
            accessToken: cookies?.accessToken,
            refreshToken: cookies?.refreshToken,
        };
    }

    setCookies(reply: FastifyReply, tokens: AuthTokens): void {
        if (!tokens.accessToken) return;

        const secure = process.env.NODE_ENV === 'production';
        reply.setCookie('accessToken', tokens.accessToken, {
            httpOnly: true,
            secure,
            sameSite: 'lax',
            maxAge: this.config.accessTokenLifetimeMs,
        });

        if (tokens.refreshToken) {
            reply.setCookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure,
                sameSite: 'lax',
                maxAge: this.config.refreshTokenLifetimeMs,
            });
        }
    }

    clearCookies(reply: FastifyReply): void {
        reply.clearCookie('accessToken');
        reply.clearCookie('refreshToken');
    }

    private async verifyToken(
        token: string | undefined,
        secret: string,
    ): Promise<VerifyResult> {
        if (!token) return 'invalid';
        try {
            const result = await jwtVerify(token, new TextEncoder().encode(secret));
            return result.payload as JwtPayload;
        } catch (error) {
            if (error instanceof errors.JWTExpired) return 'expired';
            return 'invalid';
        }
    }
}
