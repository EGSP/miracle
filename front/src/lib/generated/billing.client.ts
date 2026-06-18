/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import type { YandexBalance } from '@miracle/types';

export const billing = {
    balance: () => customInstance<YandexBalance>({
        method: 'GET',
        url: '/billing/balance',
    }),
};
