import { createZodDto } from 'nestjs-zod';
import { AnalyseOrderSchema } from '@miracle/types';

export class AnalyseOrderDto extends createZodDto(AnalyseOrderSchema) {}
