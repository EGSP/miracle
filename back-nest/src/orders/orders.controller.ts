import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { DesignationWorkerInput, Order, OrderDetails, OrderQuery, Stored } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JobRuntimeService } from '../jobs/job-runtime.service.js';
import { FilesService } from '../files/files.service.js';
import { TechnicalConditionsService } from '../technical-conditions/technical-conditions.service.js';
import { OrdersService, type OrderAnalysisAvailability } from './orders.service.js';
import { OrderJobs } from './order-jobs.service.js';

@Controller('order')
@UseGuards(AuthGuard)
export class OrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly tc: TechnicalConditionsService,
        private readonly files: FilesService,
        private readonly runtime: JobRuntimeService,
        private readonly orderJobs: OrderJobs,
    ) {}

    @Post('create')
    create(@CurrentUser() user: AuthenticatedUser, @Body() body: { fileId?: string }): Promise<Stored<Order>> {
        return this.orders.create(user.id, body?.fileId);
    }

    @Post('analyse-designation')
    @HttpCode(202)
    async analyseDesignation(@Body() body: DesignationWorkerInput): Promise<{ runId: string }> {
        if (!body?.orderId || !body?.tcId) {
            throw new BadRequestException('Тело запроса должно содержать orderId и tcId');
        }
        const order = await this.orders.getOrThrow(body.orderId);
        const tc = await this.tc.getByIdOrThrow(body.tcId);

        const details = order.details as OrderDetails | null;
        const hasRequirement = (details?.requirements ?? []).some(
            (dual) => dual.human !== undefined || (dual.ai !== undefined && dual.ai.used !== false),
        );
        if (!hasRequirement) {
            throw new BadRequestException('У заказа нет активных требований — сначала запустите анализ заявки');
        }
        if (!(tc.designationSlots as unknown[] | undefined)?.length) {
            throw new BadRequestException('У ТУ не заданы параметры условного обозначения');
        }

        const run = await this.runtime.start(this.orderJobs.designationAnalyse, {
            orderId: body.orderId,
            tcId: body.tcId,
        });
        return { runId: run.id };
    }

    @Get()
    list(@Query() query: OrderQuery): Promise<Stored<Order>[]> {
        return this.orders.getOrders(query);
    }

    @Get(':id')
    getOne(@Param('id') id: string): Promise<Stored<Order>> {
        return this.orders.getOrThrow(id);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: Partial<Pick<Order, 'fileId' | 'details'>>,
    ): Promise<Stored<Order>> {
        if (body.fileId != null && !(await this.files.get(body.fileId))) {
            throw new NotFoundException('Файл не найден');
        }
        return this.orders.update(id, { fileId: body.fileId, details: body.details });
    }

    @Get(':id/can-analyse-details')
    canAnalyse(@Param('id') id: string): Promise<OrderAnalysisAvailability> {
        return this.orders.canAnalyseOrderDetails(id);
    }

    @Post(':id/analyse-details')
    @HttpCode(202)
    async analyseDetails(
        @Param('id') id: string,
        @Query('forceReanalyse') forceReanalyse?: string,
    ): Promise<{ runId: string }> {
        if (forceReanalyse === 'true') {
            await this.orders.clearAnalysedDetails(id);
        }
        const availability = await this.orders.canAnalyseOrderDetails(id);
        if (!availability.canAnalyse) {
            throw new BadRequestException(availability.errorMessage ?? 'Анализ заказа недоступен');
        }
        const run = await this.runtime.start(this.orderJobs.orderAnalyse, { orderId: id });
        return { runId: run.id };
    }

    @Post(':id/clear-analysed-details')
    clearAnalysed(@Param('id') id: string): Promise<Stored<Order>> {
        return this.orders.clearAnalysedDetails(id);
    }
}
