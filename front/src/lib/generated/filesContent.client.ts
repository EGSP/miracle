/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { FileContent, Stored } from '@miracle/types';
import type { FilesContentGetTokensResponse, SoftDeleteContentQueryDto, FileContentQueryDto } from './models';

export const filesContent = {
    getTokens: (contentId: string) => customInstance<FilesContentGetTokensResponse>({
        method: 'GET',
        url: formatPath('/files-content/records/:contentId/tokens', { contentId }),
    }),
    softDelete: (contentId: string, softDeleteContentQueryDto: SoftDeleteContentQueryDto) => customInstance<void>({
        method: 'POST',
        url: formatPath('/files-content/records/:contentId', { contentId }),
        params: softDeleteContentQueryDto,
    }),
    getContent: (fileId: string, fileContentQueryDto: FileContentQueryDto) => customInstance<Stored<FileContent>[]>({
        method: 'GET',
        url: formatPath('/files-content/:fileId', { fileId }),
        params: fileContentQueryDto,
    }),
    extract: (_fileId: string) => customInstance<void>({
        method: 'POST',
        url: formatPath('/files-content/:fileId/extract', { _fileId }),
    }),
};
