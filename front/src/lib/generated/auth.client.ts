/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import type { LoginDto, AuthSuccessResponse, RegisterDto } from './models';

export const auth = {
    login: (loginDto: LoginDto) => customInstance<AuthSuccessResponse>({
        method: 'POST',
        url: '/auth/login',
        data: loginDto,
    }),
    register: (registerDto: RegisterDto) => customInstance<AuthSuccessResponse>({
        method: 'POST',
        url: '/auth/register',
        data: registerDto,
    }),
    refreshTokens: () => customInstance<AuthSuccessResponse>({
        method: 'POST',
        url: '/auth/refresh-tokens',
    }),
    logout: () => customInstance<AuthSuccessResponse>({
        method: 'POST',
        url: '/auth/logout',
    }),
};
