/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { Stored, User } from '@miracle/types';
import type { CreateUserDto } from './models';

export const users = {
    getMe: () => customInstance<Stored<User>>({
        method: 'GET',
        url: '/users/me',
    }),
    list: () => customInstance<Stored<User>[]>({
        method: 'GET',
        url: '/users',
    }),
    create: (createUserDto: CreateUserDto) => customInstance<Stored<User>>({
        method: 'POST',
        url: '/users',
        data: createUserDto,
    }),
    getById: (id: string) => customInstance<Stored<User>>({
        method: 'GET',
        url: formatPath('/users/:id', { id }),
    }),
};
