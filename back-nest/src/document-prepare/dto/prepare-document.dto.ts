import { createZodDto } from 'nestjs-zod';
import { PrepareDocumentSchema } from '@miracle/types';

/** Тело запроса подготовки документа: `allowVision` разрешает LLM Vision вручную (для VISUAL). */
export class PrepareDocumentDto extends createZodDto(PrepareDocumentSchema) {}
