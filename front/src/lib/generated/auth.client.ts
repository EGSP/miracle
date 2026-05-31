/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import type { LoginDto, RegisterDto, AuthSuccessResponse } from './models';

export const auth = {
    login: (loginDto: LoginDto) => customInstance<Blob>({
        method: 'POST',
        url: '/auth/login',
        data: loginDto,
        responseType: 'blob',
    }),
    register: (registerDto: RegisterDto) => customInstance<AuthSuccessResponse>({
        method: 'POST',
        url: '/auth/register',
        data: registerDto,
    }),
    refreshTokens: () => customInstance<Blob>({
        method: 'POST',
        url: '/auth/refresh-tokens',
        responseType: 'blob',
    }),
    logout: () => customInstance<Blob>({
        method: 'POST',
        url: '/auth/logout',
        responseType: 'blob',
    }),
};
