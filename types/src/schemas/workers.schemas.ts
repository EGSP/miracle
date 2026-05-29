import { z } from 'zod';
import { WorkerStatus } from '../worker.js';

export const WorkersQuerySchema = z.object({
    status: z.nativeEnum(WorkerStatus).optional(),
    sort: z.enum(['asc', 'desc']).optional(),
});
