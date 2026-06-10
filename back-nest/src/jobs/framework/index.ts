/**
 * Мини-фреймворк durable-задач на Effect (чистый, без Nest и Prisma).
 *
 * - {@link Job}/{@link defineJob} — описание единицы работы;
 * - {@link JobTool} — typed-подоперация внутри одного `JobRun`;
 * - {@link Memo}/{@link Progress}/{@link Jobs}/{@link JobTools} — сервисы, доступные телу джоба;
 * - {@link JobStore} — порт хранилища (реализуется Nest-слоем через Prisma);
 * - {@link execute} — исполнение джоба; {@link registerJob}/{@link getJob} — реестр для восстановления.
 *
 * Nest-обёртки (сервис/контроллер/модуль) живут уровнем выше, в `jobs/`.
 */
export * from './job.js';
export * from './job-tool.js';
export * from './job-impl.decorator.js';
export * from './context.js';
export * from './store.js';
export * from './registry.js';
export * from './runtime.js';
export * from './fanout.js';
export * from './hash-key.js';
