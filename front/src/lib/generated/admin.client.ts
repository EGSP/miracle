/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import type { User } from '@miracle/types';
import type { CreateUserDTO } from './models';

export const admin = {
    listUsers: () => customInstance<User[]>({
        method: 'GET',
        url: '/admin/users',
    }),
    createUser: (createUserDTO: CreateUserDTO) => customInstance<User>({
        method: 'POST',
        url: '/admin/users',
        data: createUserDTO,
    }),
};
