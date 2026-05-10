import type { Stored, WorkerData } from '@miracle/types';
import { defineRouter, route } from '../app/router.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { workersService } from '../databases/workers.db.js';

type GetWorkersQuery = {
    type?: string;
};

const getWorkers = route.get('/', {
    validate: { query: true },
    handler: async ({ query }: { query: GetWorkersQuery }) => {
        const workers = workersService.query((w) => {
            if (query.type) return w.type === query.type;
            return true;
        });

        return workers satisfies Stored<WorkerData>[];
    },
});

export const workersRouter = defineRouter('/workers', {
    middlewares: [authMiddleware],
    routes: [getWorkers],
} as const);
