import {
    CanActivate,
    type ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { USER_ROLES } from '@miracle/types';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from './current-user.decorator.js';

/**
 * Проверка роли поверх AuthGuard. Использовать как `@UseGuards(AuthGuard, AdminGuard)`:
 * AuthGuard первым заполняет `req.user`, затем AdminGuard проверяет роль.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
        const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
        const user = req.user;

        if (!user) {
            throw new UnauthorizedException('Authentication required');
        }

        const role = user.role ?? USER_ROLES.EMPLOYEE;
        if (role !== USER_ROLES.ADMIN) {
            throw new ForbiddenException('Insufficient permissions');
        }

        return true;
    }
}
