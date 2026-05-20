/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import type { GetSessionResponse } from './models';

export const session = {
    getCookieSession: () => customInstance<GetSessionResponse>({
        method: 'GET',
        url: '/sessions/cookie',
    }),
};
