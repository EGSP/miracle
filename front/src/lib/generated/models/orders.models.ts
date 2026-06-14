/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { AnalyseOrderRequestSchema, CreateTextApplicationSchema, UpdateOrderSchema } from '@miracle/types';

export interface UpdateOrderDto extends z.infer<typeof UpdateOrderSchema> {}
export interface AnalyseOrderRequestDto extends z.infer<typeof AnalyseOrderRequestSchema> {}
export interface CreateTextApplicationDto extends z.infer<typeof CreateTextApplicationSchema> {}