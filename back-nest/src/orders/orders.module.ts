import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { FilesContentModule } from '../files-content/files-content.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { TechnicalConditionsModule } from '../technical-conditions/technical-conditions.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OrderJobs } from './order-jobs.service.js';

@Module({
    imports: [AuthModule, FilesModule, FilesContentModule, ProductTypesModule, TechnicalConditionsModule],
    controllers: [OrdersController],
    providers: [OrdersService, OrderJobs],
    exports: [OrdersService],
})
export class OrdersModule {}
