import { Injectable } from '@nestjs/common';
import type { NewAuthTokens, PublicSession, Session, Stored, UserRole } from '@miracle/types';
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

    async existsByAccessToken(accessToken: string, userId: string): Promise<boolean> {
        const session = await this.prisma.session.findFirst({
            where: { accessToken, userId },
            select: { id: true },
        });
        return session !== null;
    }

    async getByRefreshToken(refreshToken: string): Promise<Stored<Session> | null> {
        const session = await this.prisma.session.findFirst({
            where: { refreshToken },
            orderBy: { createdAt: 'desc' },
        });
        return session as Stored<Session> | null;
    }

    async deleteByRefreshToken(refreshToken: string): Promise<void> {
        await this.prisma.session.deleteMany({ where: { refreshToken } });
    }

    async listPublicByUserId(userId: string): Promise<Stored<PublicSession>[]> {
        const sessions = await this.prisma.session.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                userId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return sessions as Stored<PublicSession>[];
    }

    async deleteByIdsForUser(userId: string, ids: string[]): Promise<void> {
        await this.prisma.session.deleteMany({
            where: { userId, id: { in: ids } },
        });
    }

    async deleteAllForUser(userId: string): Promise<void> {
        await this.prisma.session.deleteMany({ where: { userId } });
    }
}
