/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { JobRun, Stored, WorkerFinalPrompt } from '@miracle/types';
import type { JobRunsQueryDto } from './models';

export const jobs = {
    list: (jobRunsQueryDto: JobRunsQueryDto) => customInstance<Stored<JobRun>[]>({
        method: 'GET',
        url: '/jobs',
        params: jobRunsQueryDto,
    }),
    tree: (id: string) => customInstance<Stored<JobRun>[]>({
        method: 'GET',
        url: formatPath('/jobs/:id/tree', { id }),
    }),
    previewPrompt: (id: string) => customInstance<WorkerFinalPrompt>({
        method: 'GET',
        url: formatPath('/jobs/:id/preview-prompt', { id }),
    }),
    cancel: (id: string) => customInstance<void>({
        method: 'POST',
        url: formatPath('/jobs/:id/cancel', { id }),
    }),
    remove: (id: string) => customInstance<void>({
        method: 'DELETE',
        url: formatPath('/jobs/:id', { id }),
    }),
};
