import {
    CanActivate,
    type ExecutionContext,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokensService } from '../tokens/tokens.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from './current-user.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly tokens: TokensService,
        private readonly db: DatabaseService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<FastifyRequest>();
        const accessToken = req.cookies?.accessToken;

        const payload = await this.tokens.verifyAccessToken(accessToken);
        if (payload === 'expired') {
            throw new UnauthorizedException('Access token expired');
        }
        if (payload === 'invalid') {
            throw new UnauthorizedException('Access token invalid');
        }

        const user = this.db.collections.users.getById(payload.sub);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const { password: _password, ...publicUser } = user;
        (req as FastifyRequest & { user?: AuthenticatedUser }).user =
            publicUser as AuthenticatedUser;
        return true;
    }
}
