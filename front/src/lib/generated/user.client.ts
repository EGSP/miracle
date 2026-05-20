/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { User } from '@miracle/types';

export const user = {
    getUser: (params: { id: string; }) => customInstance<User>({
        method: 'GET',
        url: formatPath('/user/user/:id', params),
    }),
};
