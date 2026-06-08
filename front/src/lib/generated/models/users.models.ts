/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { CreateUserSchema, UpdateUserSchema } from '@miracle/types';

export interface CreateUserDto extends z.infer<typeof CreateUserSchema> {}
export interface UpdateUserDto extends z.infer<typeof UpdateUserSchema> {}