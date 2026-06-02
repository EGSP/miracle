import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { FilesContentModule } from '../files-content/files-content.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { TechnicalConditionsModule } from '../technical-conditions/technical-conditions.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { OcrJob } from './implementations/scan/ocr.job.js';
import { LlmVisionJob } from './implementations/scan/llm-vision.job.js';
import { LlmVisionTcJob } from './implementations/scan/llm-vision-tc.job.js';
import { TcExtractJob } from './implementations/tc-extract.job.js';
import { OrderAnalyseJob } from './implementations/order/order-analyse.job.js';
import { DesignationAnalyseJob } from './implementations/order/designation-analyse.job.js';

/**
 * Единый модуль реализаций джобов: держит все джоб-классы как провайдеры и импортирует доменные
 * модули, чьи сервисы джобам нужны. Регистрация в реестре — автоматическая ({@link JobsService}
 * находит провайдеры с маркером {@link JobImpl} через `DiscoveryService`), поэтому доменные
 * регистраторы больше не нужны. Потребители запускают джобы через `JobsService.start(id, input)`.
 */
@Module({
    imports: [FilesModule, FilesContentModule, ProductTypesModule, TechnicalConditionsModule, OrdersModule],
    providers: [OcrJob, LlmVisionJob, LlmVisionTcJob, TcExtractJob, OrderAnalyseJob, DesignationAnalyseJob],
})
export class JobImplementationsModule {}
