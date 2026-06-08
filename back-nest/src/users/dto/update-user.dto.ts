import { createZodDto } from 'nestjs-zod';
import { UpdateUserSchema } from '@miracle/types';

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
