import type { User, UserRole } from '@miracle/types';
import { USER_ROLES } from '@miracle/types';
import { defineRouter, err, route } from '../app/index.js';
import { adminService } from '../databases/admin.service.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { adminRoleMiddleware } from '../middlewares/user-role.middleware.js';

type CreateUserDTO = {
    login: string;
    password: string;
    role?: UserRole;
};

const listUsers = route.get('/users', {
    handler: async () => {
        const users = await adminService.listUsers();
        return users satisfies User[];
    },
});

const createUser = route.post('/users', {
    handler: async ({ body }: { body: CreateUserDTO }) => {
        const { login, password, role } = body;

        if (!login?.trim()) {
            return err.validation('Login is required');
        }
        if (!password) {
            return err.validation('Password is required');
        }
        if (role !== undefined && !Object.values(USER_ROLES).includes(role)) {
            return err.validation('Invalid role');
        }

        try {
            const created = await adminService.createUser({
                login: login.trim(),
                password,
                role,
            });
            return created satisfies User;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create user';
            if (message === 'User already exists') {
                return err.conflict(`Login "${login.trim()}" is already taken`);
            }
            return err.internal(message);
        }
    },
});

export const adminRouter = defineRouter('/admin', {
    middlewares: [authMiddleware, adminRoleMiddleware],
    routes: [
        listUsers,
        createUser,
    ],
} as const);
