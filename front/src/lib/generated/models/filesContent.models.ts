/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { ExtractContentQuerySchema, FileContentQuerySchema, SoftDeleteContentQuerySchema } from '@miracle/types';

export interface SoftDeleteContentQueryDto extends z.infer<typeof SoftDeleteContentQuerySchema> {}
export interface FileContentQueryDto extends z.infer<typeof FileContentQuerySchema> {}
export interface ExtractContentQueryDto extends z.infer<typeof ExtractContentQuerySchema> {}

export type FilesContentGetTokensResponse = { tokens: number };