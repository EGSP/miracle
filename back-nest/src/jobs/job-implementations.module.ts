import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { FilesContentModule } from '../files-content/files-content.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { TechnicalConditionsModule } from '../technical-conditions/technical-conditions.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { DocumentPrepareModule } from '../document-prepare/document-prepare.module.js';
import { OcrJob } from './implementations/scan/ocr.job.js';
import { LlmVisionJob } from './implementations/scan/llm-vision.job.js';
import { LlmVisionTcJob } from './implementations/scan/llm-vision-tc.job.js';
import { TcExtractJob } from './implementations/tc-extract.job.js';
import { ExtractPositionsFromChunkJob } from './implementations/order/extract-positions-from-chunk.job.js';
import { ExtractVisualJob } from './implementations/order/extract-visual.job.js';
import { AnalyseDesignationJob } from './implementations/order/analyse-designation.job.js';
import { AnalyseApplicationJob } from './implementations/order/analyse-application.job.js';
import { AnalyseOrderJob } from './implementations/order/analyse-order.job.js';
import { PrepareDocumentJob } from './implementations/document-prepare/prepare-document.job.js';

/**
 * Единый модуль реализаций джобов: держит все джоб-классы как провайдеры и импортирует доменные
 * модули, чьи сервисы джобам нужны. Регистрация в реестре — автоматическая ({@link JobsService}
 * находит провайдеры с маркером {@link JobImpl} через `DiscoveryService`), поэтому доменные
 * регистраторы больше не нужны. Потребители запускают джобы через `JobsService.start(id, input)`.
 */
@Module({
    imports: [FilesModule, FilesContentModule, ProductTypesModule, TechnicalConditionsModule, OrdersModule, DocumentPrepareModule],
    providers: [
        OcrJob,
        LlmVisionJob,
        LlmVisionTcJob,
        TcExtractJob,
        ExtractPositionsFromChunkJob,
        ExtractVisualJob,
        AnalyseDesignationJob,
        AnalyseApplicationJob,
        AnalyseOrderJob,
        PrepareDocumentJob,
    ],
})
export class JobImplementationsModule {}
