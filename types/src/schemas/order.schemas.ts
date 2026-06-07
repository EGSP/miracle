import { z } from 'zod';

export const UpdateOrderSchema = z.object({
    name: z.string().trim().min(1, 'Название не может быть пустым').max(200).nullable().optional(),
});
