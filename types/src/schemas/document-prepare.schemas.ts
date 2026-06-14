import { z } from 'zod';

/** Тело запроса подготовки документа: `allowVision` разрешает LLM Vision вручную (для VISUAL). */
export const PrepareDocumentSchema = z.object({
    allowVision: z.boolean().default(false),
});

export type PrepareDocumentInput = z.infer<typeof PrepareDocumentSchema>;
