/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import type { LlmUsageByOrder, LlmUsageRecord } from '@miracle/types';

export const analytics = {
    recent: () => customInstance<LlmUsageRecord[]>({
        method: 'GET',
        url: '/analytics/llm-usage/recent',
    }),
    byOrder: () => customInstance<LlmUsageByOrder[]>({
        method: 'GET',
        url: '/analytics/llm-usage/by-order',
    }),
};
