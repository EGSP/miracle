import { Injectable } from '@nestjs/common';
import type { NewAuthTokens, Session, Stored, UserRole } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
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
        private readonly prisma: PrismaService,
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
        await this.prisma.session.create({
            data: {
                userId,
                accessToken: tokenPair.accessToken,
                refreshToken: tokenPair.refreshToken,
            },
        });
        return tokenPair;
    }

    async updateSession(
        sessionId: string,
        accessToken: string,
        refreshToken: string,
    ): Promise<void> {
        await this.prisma.session.update({
            where: { id: sessionId },
            data: { accessToken, refreshToken },
        });
    }

    async getByRefreshToken(refreshToken: string): Promise<Stored<Session> | null> {
        const session = await this.prisma.session.findFirst({
            where: { refreshToken },
            orderBy: { createdAt: 'desc' },
        });
        return session as Stored<Session> | null;
    }

    private async clearUserSessions(userId: string): Promise<void> {
        await this.prisma.session.deleteMany({ where: { userId } });
    }
}
