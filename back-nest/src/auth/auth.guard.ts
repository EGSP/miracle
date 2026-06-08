import {
    CanActivate,
    type ExecutionContext,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokensService } from '../tokens/tokens.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { AuthenticatedUser } from './current-user.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly tokens: TokensService,
        private readonly prisma: PrismaService,
        private readonly sessions: SessionsService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<FastifyRequest>();
        const accessToken = req.cookies?.accessToken;

        const payload = await this.tokens.verifyAccessToken(accessToken);
        if (payload === 'expired') {
            throw new UnauthorizedException('Access token expired');
        }
        if (payload === 'invalid' || !accessToken) {
            throw new UnauthorizedException('Access token invalid');
        }

        const sessionActive = await this.sessions.existsByAccessToken(accessToken, payload.sub);
        if (!sessionActive) {
            throw new UnauthorizedException('Session revoked or invalid');
        }

        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const { password: _password, ...publicUser } = user;
        (req as FastifyRequest & { user?: AuthenticatedUser }).user =
            publicUser as AuthenticatedUser;
        return true;
    }
}
