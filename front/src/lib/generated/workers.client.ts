/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { Stored, WorkerData, WorkersQuery } from '@miracle/types';
import type { ApplyWorkerDataResponse, DeleteWorkerResponse, WorkerPromptPreview } from './models';

export const workers = {
    getWorkers: (workersQuery: WorkersQuery) => customInstance<Stored<WorkerData>[]>({
        method: 'GET',
        url: '/workers',
        params: workersQuery,
    }),
    applyWorkerData: (params: { id: string; }) => customInstance<ApplyWorkerDataResponse>({
        method: 'POST',
        url: formatPath('/workers/:id/apply-worker-data', params),
    }),
    deleteWorker: (params: { id: string; }) => customInstance<DeleteWorkerResponse>({
        method: 'DELETE',
        url: formatPath('/workers/:id', params),
    }),
    previewPrompt: (params: { id: string; }) => customInstance<WorkerPromptPreview>({
        method: 'GET',
        url: formatPath('/workers/:id/preview-prompt', params),
    }),
};
