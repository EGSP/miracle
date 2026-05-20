/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import type { LoginDTO, LoginResponse, RefreshTokensResponse, RegisterDTO, RegisterResponse, LogoutResponse } from './models';

export const auth = {
    login: (loginDTO: LoginDTO) => customInstance<LoginResponse>({
        method: 'POST',
        url: '/auth/login',
        data: loginDTO,
    }),
    refreshTokens: () => customInstance<RefreshTokensResponse>({
        method: 'POST',
        url: '/auth/refresh-tokens',
    }),
    register: (registerDTO: RegisterDTO) => customInstance<RegisterResponse>({
        method: 'POST',
        url: '/auth/register',
        data: registerDTO,
    }),
    logout: () => customInstance<LogoutResponse>({
        method: 'POST',
        url: '/auth/logout',
    }),
};
