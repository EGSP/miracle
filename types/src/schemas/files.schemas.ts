import { z } from 'zod';

const FileSettingsSchema = z.object({
    complexLayout: z.boolean().optional(),
    isTechnicalCondition: z.boolean().optional(),
    usedPages: z.string().optional(),
});

export const PatchFileSchema = z.object({
    settings: FileSettingsSchema.optional(),
});

/** Query-параметры приходят строками, поэтому булевы значения парсим из 'true'/'false'. */
const BooleanFromQuery = z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const FilesQuerySchema = z.object({
    id: z.string().optional(),
    authorId: z.string().optional(),
    available: BooleanFromQuery.optional(),
    includeMeta: BooleanFromQuery.optional(),
    isTechnicalCondition: BooleanFromQuery.optional(),
});
