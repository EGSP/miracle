import type { Stored, WorkerData, WorkersQuery } from '@miracle/types';
import { defineRouter, route } from '../app/router.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { workersService } from '../databases/workers.db.js';

const getWorkers = route.get('/', {
    validate: { query: true },
    handler: async ({ query }: { query: WorkersQuery }) => {
        let workers = workersService.query((w) => {
            if (query.status) return w.status === query.status;
            return true;
        });

        if (query.sort === 'desc') {
            workers = [...workers].sort((a, b) => b.createdAt - a.createdAt);
        } else if (query.sort === 'asc') {
            workers = [...workers].sort((a, b) => a.createdAt - b.createdAt);
        }

        return workers satisfies Stored<WorkerData>[];
    },
});

export const workersRouter = defineRouter('/workers', {
    middlewares: [authMiddleware],
    routes: [getWorkers],
} as const);
