import { z } from 'zod';

export const JobRunsQuerySchema = z.object({
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
    sort: z.enum(['asc', 'desc']).optional(),
});

export type JobRunsQuery = z.infer<typeof JobRunsQuerySchema>;
