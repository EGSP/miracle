import { createZodDto } from 'nestjs-zod';
import { LoginSchema } from '@miracle/types';

export class LoginDto extends createZodDto(LoginSchema) {}
