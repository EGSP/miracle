import type { User, UserRole } from '@miracle/types';
import { USER_ROLES } from '@miracle/types';
import { userService } from './user.db.js';

export type CreateUserByAdminInput = {
    login: string;
    password: string;
    role?: UserRole;
};

export const adminService = {
    listUsers: async (): Promise<User[]> => {
        return userService.getAll();
    },

    createUser: async (input: CreateUserByAdminInput): Promise<User> => {
        const role = input.role ?? USER_ROLES.EMPLOYEE;

        if (!Object.values(USER_ROLES).includes(role)) {
            throw new Error(`Invalid role: ${role}`);
        }

        return userService.create({
            login: input.login,
            password: input.password,
            role,
        });
    },
};
