import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type {
    DesignationWorkerInput,
    Order,
    OrderApplication,
    OrderDetails,
    OrderQuery,
    Stored,
} from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { UploadedFile } from '../common/uploaded-file.decorator.js';
import { JobRuntimeService } from '../jobs/job-runtime.service.js';
import { FilesService } from '../files/files.service.js';
import { TechnicalConditionsService } from '../technical-conditions/technical-conditions.service.js';
import { OrdersService, type OrderAnalysisAvailability } from './orders.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { OrderJobs } from './order-jobs.service.js';
import { CreateTextApplicationDto } from './dto/create-text-application.dto.js';

@Controller('order')
@UseGuards(AuthGuard)
export class OrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly orderApplications: OrderApplicationsService,
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

    @Get(':id/applications')
    async listApplications(@Param('id') id: string): Promise<Stored<OrderApplication>[]> {
        await this.orders.getOrThrow(id);
        return this.orderApplications.listByOrder(id);
    }

    /** Загрузка файла и привязка его к заказу одним запросом (multipart/form-data). */
    @Post(':id/applications/file')
    async addFileApplication(
        @Param('id') id: string,
        @UploadedFile() _file: unknown,
        @Req() req: FastifyRequest,
        @CurrentUser() user: AuthenticatedUser,
    ): Promise<Stored<OrderApplication>> {
        // Проверяем заказ до чтения стрима — дешевле отвалиться, не записав файл на диск.
        await this.orders.getOrThrow(id);
        const data = await req.file();
        if (!data) {
            throw new BadRequestException('Файл не передан');
        }
        const fileInput = await this.files.writeUploadToDisk(data, user.id);
        return this.orderApplications.createFile(id, fileInput);
    }

    @Post(':id/applications/text')
    async addTextApplication(
        @Param('id') id: string,
        @Body() body: CreateTextApplicationDto,
        @CurrentUser() user: AuthenticatedUser,
    ): Promise<Stored<OrderApplication>> {
        await this.orders.getOrThrow(id);
        return this.orderApplications.createText(id, user.id, body.text);
    }

    @Delete(':id/applications/:appId')
    async removeApplication(
        @Param('id') id: string,
        @Param('appId') appId: string,
    ): Promise<Stored<OrderApplication>> {
        await this.orders.getOrThrow(id);
        const app = await this.orderApplications.getOrThrow(appId);
        if (app.orderId !== id) {
            throw new NotFoundException('Приложение не принадлежит заказу');
        }
        return this.orderApplications.softDelete(appId);
    }
}
