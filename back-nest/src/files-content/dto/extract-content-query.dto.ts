import { createZodDto } from 'nestjs-zod';
import { ExtractContentQuerySchema } from '@miracle/types';

export class ExtractContentQueryDto extends createZodDto(ExtractContentQuerySchema) {}
