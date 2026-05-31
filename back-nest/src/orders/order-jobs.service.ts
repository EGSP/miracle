import { Injectable, type OnModuleInit } from '@nestjs/common';
import { registerJob } from '../jobs/registry.js';
import type { AnyJob } from '../jobs/job.js';
import { YandexService } from '../yandex/yandex.service.js';
import { FilesContentService } from '../files-content/files-content.service.js';
import { ProductTypesService } from '../product-types/product-types.service.js';
import { TechnicalConditionsService } from '../technical-conditions/technical-conditions.service.js';
import { OrdersService } from './orders.service.js';
import { createOrderJobs } from './order-jobs.js';

/** Строит и регистрирует джобы `order-analyse` и `designation-analyse` (замыкание сервисов). */
@Injectable()
export class OrderJobs implements OnModuleInit {
    readonly orderAnalyse: AnyJob;
    readonly designationAnalyse: AnyJob;

    constructor(
        orders: OrdersService,
        filesContent: FilesContentService,
        productTypes: ProductTypesService,
        tc: TechnicalConditionsService,
        yandex: YandexService,
    ) {
        const jobs = createOrderJobs({ orders, filesContent, productTypes, tc, yandex });
        this.orderAnalyse = jobs.orderAnalyse;
        this.designationAnalyse = jobs.designationAnalyse;
    }

    onModuleInit(): void {
        registerJob(this.orderAnalyse);
        registerJob(this.designationAnalyse);
    }
}
