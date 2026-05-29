import { z } from 'zod';

export const CreateProductTypeSchema = z.object({
    name: z.string().trim().min(1, 'Название типа продукции обязательно'),
    synonyms: z.array(z.string()).default([]),
});

export const UpdateProductTypeSchema = z.object({
    name: z.string().trim().min(1, 'Название типа продукции не может быть пустым').optional(),
    synonyms: z.array(z.string()).optional(),
});
