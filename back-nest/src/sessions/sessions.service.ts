import { Injectable } from '@nestjs/common';
import type { NewAuthTokens, Session, UserRole } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import type { StoredEntity } from '../database/json-collection.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { TokensService } from '../tokens/tokens.service.js';
import { resolveUserRole } from './user-role.util.js';

export type CookieSessionResponse = {
    userId: string;
    role: UserRole;
};

@Injectable()
export class SessionsService {
    constructor(
        private readonly db: DatabaseService,
        private readonly tokens: TokensService,
    ) {}

    getCookieSession(user: AuthenticatedUser): CookieSessionResponse {
        return {
            userId: user.id,
            role: resolveUserRole(user),
        };
    }

    async createSession(userId: string): Promise<NewAuthTokens> {
        await this.clearUserSessions(userId);
        const tokenPair = await this.tokens.signTokens({ sub: userId });
        await this.db.collections.sessions.create({
            userId,
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
        });
        return tokenPair;
    }

    async updateSession(
        sessionId: string,
        accessToken: string,
        refreshToken: string,
    ): Promise<void> {
        await this.db.collections.sessions.update(sessionId, {
            accessToken,
            refreshToken,
        });
    }

    getByRefreshToken(refreshToken: string): StoredEntity<Session> | undefined {
        return this.db.collections.sessions
            .ref()
            .filter((session) => session.refreshToken === refreshToken)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
    }

    private async clearUserSessions(userId: string): Promise<void> {
        for (const session of this.db.collections.sessions.list()) {
            if (session.userId === userId) {
                await this.db.collections.sessions.delete(session.id);
            }
        }
    }
}
