import { createZodDto } from 'nestjs-zod';
import { UpdateOrderSchema } from '@miracle/types';

export class UpdateOrderDto extends createZodDto(UpdateOrderSchema) {}
