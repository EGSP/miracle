import type { User, UserRole } from '@miracle/types';
import { USER_ROLES } from '@miracle/types';
import { err, mw } from '../app/index.js';
import { resolveUserRole } from '../lib/user-role.util.js';

export { resolveUserRole } from '../lib/user-role.util.js';

/**
 * @description Middleware проверки роли. Должен выполняться после authMiddleware.
 */
export function requireRole(...roles: readonly UserRole[]) {
    return mw(async ({ locals }) => {
        const user = locals.user as User | undefined;

        if (!user) {
            return err.unauthorized('Authentication required');
        }

        const role = resolveUserRole(user);

        if (!roles.includes(role)) {
            return err.forbidden('Insufficient permissions');
        }
    });
}

export const adminRoleMiddleware = requireRole(USER_ROLES.ADMIN);
