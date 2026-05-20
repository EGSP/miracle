/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import type { HealthResponse } from './models';

export const health = {
    checkHealth: () => customInstance<HealthResponse>({
        method: 'GET',
        url: '/health',
    }),
};
