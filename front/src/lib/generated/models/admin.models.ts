/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import type { User, UserRole } from '@miracle/types';
export type { User, UserRole } from '@miracle/types';

export type CreateUserDTO = {
    login: string;
    password: string;
    role?: UserRole;
};