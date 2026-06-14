import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
    AnalysisParamDef,
    AnalysisReadiness,
    AnalysisVariantInfo,
    JobRun,
    Order,
    OrderApplication,
    OrderPositionWithDesignation,
    OrderQuery,
    OrderReportInfo,
    Stored,
} from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { UploadedFile } from '../common/uploaded-file.decorator.js';
import { BinaryResponse } from '../common/binary-response.decorator.js';
import { FilesService } from '../files/files.service.js';
import { OrdersService } from './orders.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { OrderPositionsService } from './order-positions.service.js';
import { OrderAnalysisService } from './order-analysis.service.js';
import { OrderAnalysisVariantsService } from './order-analysis-variants.service.js';
import { OrderReportService } from './order-report.service.js';
import { CreateTextApplicationDto } from './dto/create-text-application.dto.js';
import { AnalyseOrderRequestDto } from './dto/analyse-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';

@Controller('order')
@UseGuards(AuthGuard)
export class OrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly orderApplications: OrderApplicationsService,
        private readonly orderPositions: OrderPositionsService,
        private readonly orderAnalysis: OrderAnalysisService,
        private readonly analysisVariants: OrderAnalysisVariantsService,
        private readonly orderReport: OrderReportService,
        private readonly files: FilesService,
    ) {}

    @Post('create')
    create(@CurrentUser() user: AuthenticatedUser): Promise<Stored<Order>> {
        return this.orders.create(user.id);
    }

    @Get()
    list(@Query() query: OrderQuery): Promise<Stored<Order>[]> {
        return this.orders.getOrders(query);
    }

    @Get(':id')
    getOne(@Param('id') id: string): Promise<Stored<Order>> {
        return this.orders.getOrThrow(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: UpdateOrderDto): Promise<Stored<Order>> {
        return this.orders.update(id, body);
    }

    /**
     * Унифицированный (пере)анализ заказа: тело — {@link AnalyseOrderRequestDto} `{ variantId, params }`.
     * Вариант (v1/v2) и интерпретацию параметров разводит {@link OrderAnalysisVariantsService};
     * он же проверяет готовность (нет активного прогона, VISUAL подготовлены) — иначе `409`.
     */
    @Post(':id/analyse')
    async analyse(@Param('id') id: string, @Body() body: AnalyseOrderRequestDto): Promise<Stored<JobRun>> {
        await this.orders.getOrThrow(id);
        return this.analysisVariants.run(id, body.variantId, body.params) as Promise<Stored<JobRun>>;
    }

    /** Доступные варианты анализа заказа (id+name+description) — для дропдауна. */
    @Get(':id/analysis-variants')
    async listAnalysisVariants(@Param('id') id: string): Promise<AnalysisVariantInfo[]> {
        await this.orders.getOrThrow(id);
        return this.analysisVariants.listVariants();
    }

    /** Схема параметров запуска выбранного варианта — для динамического рендера формы. */
    @Get(':id/analysis-variants/:variantId/params')
    async getAnalysisParams(
        @Param('id') id: string,
        @Param('variantId') variantId: string,
    ): Promise<AnalysisParamDef[]> {
        await this.orders.getOrThrow(id);
        return this.analysisVariants.getParams(variantId);
    }

    /** Готовность заказа к запуску варианта: блокеры (активный прогон, неподготовленные VISUAL). */
    @Get(':id/analysis-readiness')
    async analysisReadiness(
        @Param('id') id: string,
        @Query('variantId') variantId: string,
    ): Promise<AnalysisReadiness> {
        await this.orders.getOrThrow(id);
        return this.analysisVariants.readiness(id, variantId);
    }

    /** Текущий корневой прогон анализа заказа (или `null`, если не запускался) — для тайла прогресса. */
    @Get(':id/job')
    async getJob(@Param('id') id: string): Promise<Stored<JobRun> | null> {
        await this.orders.getOrThrow(id);
        return this.orderAnalysis.getRun(id);
    }

    @Get(':id/applications')
    async listApplications(@Param('id') id: string): Promise<Stored<OrderApplication>[]> {
        await this.orders.getOrThrow(id);
        return this.orderApplications.listByOrder(id);
    }

    /** Позиции заказа вместе с обозначениями (1:1, null если не определено) — для блока продукции. */
    @Get(':id/positions')
    async listPositions(@Param('id') id: string): Promise<OrderPositionWithDesignation[]> {
        await this.orders.getOrThrow(id);
        return this.orderPositions.listByOrderWithDesignations(id);
    }

    /** Доступные Excel-отчёты по заказу. */
    @Get(':id/reports')
    async listReports(@Param('id') id: string): Promise<OrderReportInfo[]> {
        await this.orders.getOrThrow(id);
        return this.orderReport.listAvailable();
    }

    /** Excel-отчёт по распознанной продукции заказа (скачивание xlsx). */
    @Get(':id/report')
    @BinaryResponse()
    async report(
        @Param('id') id: string,
        @Query('reportId') reportId: string | undefined,
        @Res() reply: FastifyReply,
    ): Promise<void> {
        await this.orders.getOrThrow(id);
        const buffer = await this.orderReport.buildWorkbook(id, reportId);
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="order-${id}-${reportId}.xlsx"`);
        reply.send(buffer);
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
