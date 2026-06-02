import { SetMetadata } from '@nestjs/common';

/**
 * Метаданные-маркер инъецируемого джоба. {@link JobsService} на старте находит все провайдеры
 * с этим маркером через `DiscoveryService` и регистрирует их в реестре — ручная регистрация
 * (прежние доменные регистраторы) больше не нужна.
 */
export const JOB_IMPL_METADATA = 'jobs:impl';

/**
 * Помечает класс как реализацию корневого джоба. Класс должен быть `@Injectable()` и
 * структурно соответствовать {@link Job} (поля `id` и `run`). Регистрируется автоматически.
 *
 * @example
 * ```ts
 * @Injectable()
 * @JobImpl()
 * export class OcrJob implements Job<ScanInput, void> {
 *   readonly id = brandJobId('ocr');
 *   run = (input: ScanInput) => Effect.gen(function* () { ... });
 * }
 * ```
 */
export const JobImpl = (): ClassDecorator => SetMetadata(JOB_IMPL_METADATA, true);
