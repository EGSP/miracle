import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@miracle/types';
import type { StoredEntity } from '../database/json-collection.js';

/**
 * Форма user-объекта, который AuthGuard кладёт в request после успешной проверки токена.
 * Без поля password (внутреннее), но с DbEntity-полями (id/createdAt/updatedAt).
 */
export type AuthenticatedUser = StoredEntity<User>;

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
        const req = ctx.switchToHttp().getRequest();
        return req.user as AuthenticatedUser;
    },
);
