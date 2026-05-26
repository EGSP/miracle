import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * Публичная форма пользователя для ответа эндпоинта /users/me.
 *
 * Внутри БД хранится UserInternal с полем password (см. database/collections.ts);
 * этот DTO его опускает.
 */
export const PublicUserSchema = z.object({
    id: z.string(),
    login: z.string().optional(),
    role: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export class PublicUserDto extends createZodDto(PublicUserSchema) {}
