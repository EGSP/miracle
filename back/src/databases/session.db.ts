import type { JwtPayload, NewAuthTokens, Session } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';
import { errors, jwtVerify } from 'jose';
import { serverConfig } from '../config.js';
import { signTokens } from '../middlewares/tokensTools.js';

export const sessionDb = registerDb('sessions', await JsonCollection.create<Session>('sessions'));

declare module './db.js' {
    interface DbRegistry {
        sessions: typeof sessionDb;
    }
}


export const sessionsService = {
    createSession: async (userId: string): Promise<NewAuthTokens> => {
        await sessionsService.clearUserSessions(userId);
        const { accessToken, refreshToken } = await signTokens({ sub: userId });

        await sessionDb.create({ userId, accessToken, refreshToken });
        return { accessToken, refreshToken };
    },

    updateSession: async (sessionId: string, accessToken: string, refreshToken: string): Promise<void> => {
        await sessionDb.update(sessionId, {
            accessToken,
            refreshToken,
        });
    },

    getByRefreshToken: async (refreshToken: string): Promise<Session | undefined> => {
        return sessionDb.ref()
            .filter(session => session.refreshToken === refreshToken)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
    },

    getLatestSession: (userId: string): Session | undefined => {
        return sessionDb.ref()
            .filter(session => session.userId === userId)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
    },

    /**
     * Удаляет все сессии пользователя.
     * @param userId 
     */
    clearUserSessions: async (userId: string): Promise<void> => {
        for(const session of sessionDb.list()) {
            if (session.userId === userId) {
                await sessionDb.delete(session.id);
            }
        }
    }
};

/**
 * Проверяет токен на валидность и возвращает payload или статус ошибки
 * @param token 
 * @returns 
 */
export async function verifyToken(token: string | undefined, secret: string): Promise<
    JwtPayload | "expired" | "invalid"> {
    if (!token) {
        return "invalid";
    }
    try {
        const result = await jwtVerify(token, new TextEncoder().encode(secret));
        return result.payload as JwtPayload;
    } catch (error) {
        if (error instanceof errors.JWTExpired) {
            return "expired";
        }
        return "invalid";
    }
}