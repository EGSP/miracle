/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { AnalyseOrderSchema, CreateTextApplicationSchema, UpdateOrderSchema } from '@miracle/types';

export interface UpdateOrderDto extends z.infer<typeof UpdateOrderSchema> {}
export interface AnalyseOrderDto extends z.infer<typeof AnalyseOrderSchema> {}
export interface CreateTextApplicationDto extends z.infer<typeof CreateTextApplicationSchema> {}