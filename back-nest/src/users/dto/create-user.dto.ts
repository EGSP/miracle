import { createZodDto } from 'nestjs-zod';
import { CreateUserSchema } from '@miracle/types';

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
