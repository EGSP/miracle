import { z } from 'zod';

/** Query-параметры приходят строками, поэтому булевы значения парсим из 'true'/'false'. */
const BooleanFromQuery = z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const JobRunsQuerySchema = z.object({
    status: z.enum(['queued', 'running', 'succeed', 'partial', 'failed', 'cancelled']).optional(),
    sort: z.enum(['asc', 'desc']).optional(),
    /** Только корневые прогоны (`parentId = null`) — для списка операций без выкачки всего лога. */
    onlyRoots: BooleanFromQuery.optional(),
});

export type JobRunsQuery = z.infer<typeof JobRunsQuerySchema>;
