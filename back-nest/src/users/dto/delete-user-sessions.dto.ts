import { createZodDto } from 'nestjs-zod';
import { DeleteUserSessionsSchema } from '@miracle/types';

export class DeleteUserSessionsDto extends createZodDto(DeleteUserSessionsSchema) {}
