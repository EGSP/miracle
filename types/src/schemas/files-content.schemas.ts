import { z } from 'zod';

/** Query-параметры приходят строками, поэтому булевы значения парсим из 'true'/'false'. */
const BooleanFromQuery = z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const FileContentQuerySchema = z.object({
    onlyLast: BooleanFromQuery.optional(),
    includeDeleted: BooleanFromQuery.optional(),
});

export const SoftDeleteContentQuerySchema = z.object({
    mark: BooleanFromQuery,
});

export const ExtractContentQuerySchema = z.object({
    retryIfLastFailed: BooleanFromQuery.optional(),
});
