/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { PublicSession, Stored, User } from '@miracle/types';
import type { CreateUserDto, DeleteUserSessionsDto, UpdateUserDto } from './models';

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
    listSessions: (id: string) => customInstance<Stored<PublicSession>[]>({
        method: 'GET',
        url: formatPath('/users/:id/sessions', { id }),
    }),
    deleteAllSessions: (id: string) => customInstance<void>({
        method: 'DELETE',
        url: formatPath('/users/:id/sessions/all', { id }),
    }),
    deleteSessions: (id: string, deleteUserSessionsDto: DeleteUserSessionsDto) => customInstance<void>({
        method: 'DELETE',
        url: formatPath('/users/:id/sessions', { id }),
        data: deleteUserSessionsDto,
    }),
    update: (id: string, updateUserDto: UpdateUserDto) => customInstance<Stored<User>>({
        method: 'PATCH',
        url: formatPath('/users/:id', { id }),
        data: updateUserDto,
    }),
    getById: (id: string) => customInstance<Stored<User>>({
        method: 'GET',
        url: formatPath('/users/:id', { id }),
    }),
};
