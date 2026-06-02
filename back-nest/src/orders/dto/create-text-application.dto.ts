import { createZodDto } from 'nestjs-zod';
import { CreateTextApplicationSchema } from '@miracle/types';

export class CreateTextApplicationDto extends createZodDto(CreateTextApplicationSchema) {}
