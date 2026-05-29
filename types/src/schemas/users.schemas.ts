import { z } from 'zod';
import { USER_ROLES } from '../user-role.js';

export const CreateUserSchema = z.object({
    login: z.string().trim().min(1, 'Login is required'),
    password: z.string().min(1, 'Password is required'),
    role: z.nativeEnum(USER_ROLES).optional(),
});
