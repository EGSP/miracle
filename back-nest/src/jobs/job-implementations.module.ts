import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { FilesContentModule } from '../files-content/files-content.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { TechnicalConditionsModule } from '../technical-conditions/technical-conditions.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { DocumentPrepareModule } from '../document-prepare/document-prepare.module.js';
import { ExtractPositionsFromChunkJob } from './implementations/order/extract-positions-from-chunk.job.js';
import { AnalyseDesignationJob } from './implementations/order/analyse-designation.job.js';
import { AnalyseApplicationJob } from './implementations/order/analyse-application.job.js';
import { AnalyseOrderJob } from './implementations/order/analyse-order.job.js';
import { AnalyseOrderV2Job } from './implementations/order/analyse-order-v2.job.js';
import { AnalyseGroupDesignationJob } from './implementations/order/analyse-group-designation.job.js';
import { DesignationSlotTool } from './implementations/order/tools/designation-slot.tool.js';
import { VisionExtractTool } from './implementations/document-prepare/tools/vision-extract.tool.js';
import { VisionPrepareJob } from './implementations/document-prepare/vision-prepare.job.js';

/**
 * Единый модуль реализаций джобов: держит все джоб-классы как провайдеры и импортирует доменные
 * модули, чьи сервисы джобам нужны. Регистрация в реестре — автоматическая ({@link JobsService}
 * находит провайдеры с маркером {@link JobImpl} через `DiscoveryService`), поэтому доменные
 * регистраторы больше не нужны. Потребители запускают джобы через `JobsService.start(id, input)`.
 *
 * DPS (kreuzberg/libre) джобы не использует — обработка идёт через {@link DpsPipeline} «в моменте».
 * `VisionExtractTool` остаётся для Phase 2 (Yandex-линия запустит durable-джобу как свой этап).
 */
@Module({
    imports: [FilesModule, FilesContentModule, ProductTypesModule, TechnicalConditionsModule, OrdersModule, DocumentPrepareModule],
    providers: [
        ExtractPositionsFromChunkJob,
        AnalyseDesignationJob,
        AnalyseApplicationJob,
        AnalyseOrderJob,
        AnalyseOrderV2Job,
        AnalyseGroupDesignationJob,
        DesignationSlotTool,
        VisionExtractTool,
        VisionPrepareJob,
    ],
})
export class JobImplementationsModule {}
