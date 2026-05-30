import { createZodDto } from 'nestjs-zod';
import { SoftDeleteContentQuerySchema } from '@miracle/types';

export class SoftDeleteContentQueryDto extends createZodDto(SoftDeleteContentQuerySchema) {}
