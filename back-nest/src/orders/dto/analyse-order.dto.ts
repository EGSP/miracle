import { createZodDto } from 'nestjs-zod';
import { AnalyseOrderRequestSchema } from '@miracle/types';

/** Тело унифицированного запуска анализа: `{ variantId, params }`. */
export class AnalyseOrderRequestDto extends createZodDto(AnalyseOrderRequestSchema) {}
