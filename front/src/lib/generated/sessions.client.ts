/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import type { CookieSessionResponse } from './models';

export const sessions = {
    getCookieSession: () => customInstance<CookieSessionResponse>({
        method: 'GET',
        url: '/sessions/cookie',
    }),
};
