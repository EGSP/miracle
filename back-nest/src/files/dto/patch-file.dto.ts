import { createZodDto } from 'nestjs-zod';
import { PatchFileSchema } from '@miracle/types';

export class PatchFileDto extends createZodDto(PatchFileSchema) {}
