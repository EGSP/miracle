import { createZodDto } from 'nestjs-zod';
import { UpdateProductTypeSchema } from '@miracle/types';

export class UpdateProductTypeDto extends createZodDto(UpdateProductTypeSchema) {}
