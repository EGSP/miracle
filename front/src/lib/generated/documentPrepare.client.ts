/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { PrepareStatus, PreparedDocument, Stored } from '@miracle/types';
import type { DocumentPreparePrepareResponse } from './models';

export const documentPrepare = {
    getPrepared: (fileId: string) => customInstance<Stored<PreparedDocument> | null>({
        method: 'GET',
        url: formatPath('/documents/:fileId', { fileId }),
    }),
    getStatus: (fileId: string) => customInstance<{ status: PrepareStatus | null }>({
        method: 'GET',
        url: formatPath('/documents/:fileId/status', { fileId }),
    }),
    prepare: (fileId: string) => customInstance<DocumentPreparePrepareResponse>({
        method: 'POST',
        url: formatPath('/documents/:fileId/prepare', { fileId }),
    }),
};
