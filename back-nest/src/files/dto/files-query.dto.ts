import { createZodDto } from 'nestjs-zod';
import { FilesQuerySchema } from '@miracle/types';

export class FilesQueryDto extends createZodDto(FilesQuerySchema) {}
