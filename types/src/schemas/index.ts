/**
 * Zod-схемы общих DTO, разделяемых между бэкендом и фронтендом.
 *
 * Что сюда кладётся:
 * - Схемы входных DTO для HTTP-эндпоинтов (body, query, params).
 * - Любые схемы, нужные одновременно бэкенду (для runtime-валидации
 *   через `createZodDto` + `ZodValidationPipe`) и фронтенду
 *   (для типов клиента через `z.infer` и/или валидации форм).
 *
 * Что сюда НЕ кладётся:
 * - Response-типы (контракт ответа сервера). Они — обычные TS-типы
 *   в соседних файлах (`user.ts`, `order.ts`, ...). Runtime-валидация
 *   ответа на фронте не нужна.
 * - Схемы, используемые только внутри бэкенда (env-конфиг,
 *   воркер-payload между процессами). Они живут в самом back-nest.
 *
 * Соглашение об именовании:
 * - Файл: `<domain>.schemas.ts` (например, `orders.schemas.ts`).
 * - Имя схемы: `<Scenario>Schema` (`CreateOrderSchema`, `OrdersQuerySchema`).
 * - Схемы экспортируются именованно (не default).
 *
 * Пример (когда появятся реальные схемы):
 *
 *   // types/src/schemas/orders.schemas.ts
 *   import { z } from 'zod';
 *
 *   export const CreateOrderSchema = z.object({
 *       fileId: z.string().uuid().optional(),
 *   });
 *
 *   export const OrdersQuerySchema = z.object({
 *       userId: z.string().optional(),
 *       isCompleted: z.coerce.boolean().optional(),
 *   });
 *
 * Использование на бэке (back-nest):
 *
 *   import { CreateOrderSchema } from '@miracle/types';
 *   import { createZodDto } from 'nestjs-zod';
 *   export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}
 *
 * Использование на фронте:
 *
 *   import { CreateOrderSchema } from '@miracle/types';
 *   import type { z } from 'zod';
 *   type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
 *
 * Когда добавляешь новый файл — обязательно дописать в этот index.ts.
 */

export * from './auth.schemas.js';
export * from './product-types.schemas.js';
export * from './workers.schemas.js';
export * from './users.schemas.js';
export * from './files.schemas.js';
export * from './files-content.schemas.js';
export * from './job-runs.schemas.js';
export * from './order-applications.schemas.js';
export * from './order.schemas.js';
export * from './document-prepare.schemas.js';
// ...
