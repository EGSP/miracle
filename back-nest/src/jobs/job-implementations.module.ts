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
import { PrepareDocumentJob } from './implementations/document-prepare/prepare-document.job.js';
import { KreuzbergExtractTool } from './implementations/document-prepare/tools/kreuzberg-extract.tool.js';
import { VisionExtractTool } from './implementations/document-prepare/tools/vision-extract.tool.js';
import { PrepareApplyTool } from './implementations/document-prepare/tools/prepare-apply.tool.js';

/**
 * Единый модуль реализаций джобов: держит все джоб-классы как провайдеры и импортирует доменные
 * модули, чьи сервисы джобам нужны. Регистрация в реестре — автоматическая ({@link JobsService}
 * находит провайдеры с маркером {@link JobImpl} через `DiscoveryService`), поэтому доменные
 * регистраторы больше не нужны. Потребители запускают джобы через `JobsService.start(id, input)`.
 */
@Module({
    imports: [FilesModule, FilesContentModule, ProductTypesModule, TechnicalConditionsModule, OrdersModule, DocumentPrepareModule],
    providers: [
        ExtractPositionsFromChunkJob,
        AnalyseDesignationJob,
        AnalyseApplicationJob,
        AnalyseOrderJob,
        PrepareDocumentJob,
        KreuzbergExtractTool,
        VisionExtractTool,
        PrepareApplyTool,
    ],
})
export class JobImplementationsModule {}
