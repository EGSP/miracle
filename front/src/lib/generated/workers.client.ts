/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { JobRun, Stored, WorkerFinalPrompt } from '@miracle/types';

export const workers = {
    list: (query: { status?: string; sort?: string }) => customInstance<Stored<JobRun>[]>({
        method: 'GET',
        url: '/workers',
        params: query,
    }),
    previewPrompt: (id: string) => customInstance<WorkerFinalPrompt>({
        method: 'GET',
        url: formatPath('/workers/:id/preview-prompt', { id }),
    }),
    applyWorkerData: (id: string) => customInstance<void>({
        method: 'POST',
        url: formatPath('/workers/:id/apply-worker-data', { id }),
    }),
    remove: (id: string) => customInstance<void>({
        method: 'DELETE',
        url: formatPath('/workers/:id', { id }),
    }),
};
