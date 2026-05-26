import { createZodDto } from 'nestjs-zod';
import { RegisterSchema } from '@miracle/types';

export class RegisterDto extends createZodDto(RegisterSchema) {}
