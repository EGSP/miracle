/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import type { FileModel, FileWithMeta, FilesQuery, User } from '@miracle/types';
export type { FileModel, FileWithMeta, FilesQuery, User } from '@miracle/types';

export type GetFilesResponse = FileWithMeta[];

export type UploadFileResponse = FileModel;

export type PatchFileDTO = {
    settings?: FileModel['settings'];
};

export type PatchFileResponse = FileModel;

export type RestoreFileResponse = FileModel;

export type StreamFileContentResponse = null;