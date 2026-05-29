import { createZodDto } from 'nestjs-zod';
import { WorkersQuerySchema } from '@miracle/types';

export class WorkersQueryDto extends createZodDto(WorkersQuerySchema) {}
