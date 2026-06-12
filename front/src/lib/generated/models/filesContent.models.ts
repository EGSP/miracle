/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { FileContentQuerySchema, SoftDeleteContentQuerySchema } from '@miracle/types';

export interface SoftDeleteContentQueryDto extends z.infer<typeof SoftDeleteContentQuerySchema> {}
export interface FileContentQueryDto extends z.infer<typeof FileContentQuerySchema> {}

export type FilesContentGetTokensResponse = { tokens: number };