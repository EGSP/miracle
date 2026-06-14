import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentPrepareModule } from '../document-prepare/document-prepare.module.js';
import { FilesModule } from '../files/files.module.js';
import { FilesContentModule } from '../files-content/files-content.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { TechnicalConditionsModule } from '../technical-conditions/technical-conditions.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { OrderPositionsService } from './order-positions.service.js';
import { DesignationsService } from './designations.service.js';
import { ApplicationChunkReader } from './application-chunk-reader.js';
import { OrderAnalysisService } from './order-analysis.service.js';
import { OrderAnalysisVariantsService } from './order-analysis-variants.service.js';
import { OrderReportService } from './order-report.service.js';
import { _1C_ERP_Commerce_Offer } from './reports/1c-erp-commerce-offer.report.js';
import { _1C_ERP_Commerce_Offer_Extended } from './reports/1c-erp-commerce-offer-extended.report.js';

@Module({
    imports: [
        AuthModule,
        DocumentPrepareModule,
        FilesModule,
        FilesContentModule,
        ProductTypesModule,
        TechnicalConditionsModule,
    ],
    controllers: [OrdersController],
    providers: [
        OrdersService,
        OrderApplicationsService,
        OrderPositionsService,
        DesignationsService,
        ApplicationChunkReader,
        OrderAnalysisService,
        OrderAnalysisVariantsService,
        OrderReportService,
        _1C_ERP_Commerce_Offer,
        _1C_ERP_Commerce_Offer_Extended,
    ],
    exports: [
        OrdersService,
        OrderApplicationsService,
        OrderPositionsService,
        DesignationsService,
        ApplicationChunkReader,
        OrderAnalysisService,
    ],
})
export class OrdersModule {}
