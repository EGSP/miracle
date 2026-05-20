import type { User, UserRole } from '@miracle/types';
import { USER_ROLES } from '@miracle/types';

export function resolveUserRole(user: User | undefined): UserRole {
    return user?.role ?? USER_ROLES.EMPLOYEE;
}
