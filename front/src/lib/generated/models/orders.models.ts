/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { OrderAnalysisAvailability } from './common.models';

import type { z } from 'zod';
import { CreateTextApplicationSchema } from '@miracle/types';

import type { DesignationWorkerInput } from '@miracle/types';

export interface CreateTextApplicationDto extends z.infer<typeof CreateTextApplicationSchema> {}

export type OrdersAnalyseDesignationResponse = { runId: string };
export type OrdersAnalyseDetailsResponse = { runId: string };