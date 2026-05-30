import { createZodDto } from 'nestjs-zod';
import { FileContentQuerySchema } from '@miracle/types';

export class FileContentQueryDto extends createZodDto(FileContentQuerySchema) {}
