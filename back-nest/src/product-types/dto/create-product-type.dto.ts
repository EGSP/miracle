import { createZodDto } from 'nestjs-zod';
import { CreateProductTypeSchema } from '@miracle/types';

export class CreateProductTypeDto extends createZodDto(CreateProductTypeSchema) {}
