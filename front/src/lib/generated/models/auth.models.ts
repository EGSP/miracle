/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { LoginSchema, RegisterSchema } from '@miracle/types';

export type AuthSuccessResponse = { status: 'success' };

export interface LoginDto extends z.infer<typeof LoginSchema> {}
export interface RegisterDto extends z.infer<typeof RegisterSchema> {}