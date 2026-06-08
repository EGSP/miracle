/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { CreateUserSchema, DeleteUserSessionsSchema, UpdateUserSchema } from '@miracle/types';

export interface CreateUserDto extends z.infer<typeof CreateUserSchema> {}
export interface DeleteUserSessionsDto extends z.infer<typeof DeleteUserSessionsSchema> {}
export interface UpdateUserDto extends z.infer<typeof UpdateUserSchema> {}