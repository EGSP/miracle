import { z } from 'zod';

export const CreateTextApplicationSchema = z.object({
    text: z.string().trim().min(1, 'Текст приложения не может быть пустым'),
});
