import type { Stored, WorkerData, WorkerFinalPrompt, WorkersQuery } from '@miracle/types';
import { defineRouter, route } from '../app/router.js';
import { err } from '../app/index.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { workersService } from '../databases/workers.db.js';

/**
 * Превью собранного промпта воркера — то, что реально ушло в LLM.
 * Тип — re-export из @miracle/types для удобства клиента.
 */
export type WorkerPromptPreview = WorkerFinalPrompt;

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

const applyWorkerData = route.post('/:id/apply-worker-data', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        await workersService.applyWorkerData(params.id);
    },
});

const deleteWorker = route.delete('/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        await workersService.delete(params.id);
    },
});

const previewPrompt = route.get('/:id/preview-prompt', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const worker = workersService.get(params.id);
        if (!worker) {
            return err.notFound('Worker not found');
        }

        if (
            worker.type !== 'designation-worker'
            && worker.type !== 'order-details-worker'
        ) {
            return err.badRequest(
                `Превью промпта поддерживается только для designation-worker и order-details-worker (получен ${worker.type})`,
            );
        }

        if (!worker.finalPrompt) {
            return err.notFound(
                'У воркера ещё нет сохранённого промпта (возможно, run() не успел стартовать или упал до сборки промпта)',
            );
        }

        return worker.finalPrompt satisfies WorkerPromptPreview;
    },
});

export const workersRouter = defineRouter('/workers', {
    middlewares: [authMiddleware],
    routes: [getWorkers, applyWorkerData, deleteWorker, previewPrompt],
} as const);
