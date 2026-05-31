/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { FileModel, FileWithMeta } from '@miracle/types';
import type { FilesQueryDto, PatchFileDto } from './models';

export const files = {
    getFiles: (filesQueryDto: FilesQueryDto) => customInstance<FileWithMeta[]>({
        method: 'GET',
        url: '/files',
        params: filesQueryDto,
    }),
    upload: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return customInstance<FileModel>({
        method: 'POST',
        url: '/files/upload',
        data: formData,
        });
    },
    patch: (id: string, patchFileDto: PatchFileDto) => customInstance<FileModel>({
        method: 'PATCH',
        url: formatPath('/files/:id', { id }),
        data: patchFileDto,
    }),
    restore: (id: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return customInstance<FileModel>({
        method: 'POST',
        url: formatPath('/files/:id/restore', { id }),
        data: formData,
        });
    },
    streamContent: (id: string) => customInstance<Blob>({
        method: 'GET',
        url: formatPath('/files/:id/content', { id }),
        responseType: 'blob',
    }),
};
