import { createZodDto } from 'nestjs-zod';
import { JobRunsQuerySchema } from '@miracle/types';

export class JobRunsQueryDto extends createZodDto(JobRunsQuerySchema) {}
