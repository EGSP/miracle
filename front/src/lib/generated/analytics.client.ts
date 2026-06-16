/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { LlmUsageByJob, LlmUsageByOrder, LlmUsageRecord } from '@miracle/types';

export const analytics = {
    recent: () => customInstance<LlmUsageRecord[]>({
        method: 'GET',
        url: '/analytics/llm-usage/recent',
    }),
    byOrder: () => customInstance<LlmUsageByOrder[]>({
        method: 'GET',
        url: '/analytics/llm-usage/by-order',
    }),
    byJob: (orderId: string) => customInstance<LlmUsageByJob[]>({
        method: 'GET',
        url: formatPath('/analytics/llm-usage/by-order/:orderId/by-job', { orderId }),
    }),
};
