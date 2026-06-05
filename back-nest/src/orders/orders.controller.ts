import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
    JobRun,
    Order,
    OrderApplication,
    OrderPositionWithDesignation,
    OrderQuery,
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
import { OrderReportService } from './order-report.service.js';
import { CreateTextApplicationDto } from './dto/create-text-application.dto.js';
import { AnalyseOrderDto } from './dto/analyse-order.dto.js';

@Controller('order')
@UseGuards(AuthGuard)
export class OrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly orderApplications: OrderApplicationsService,
        private readonly orderPositions: OrderPositionsService,
        private readonly orderAnalysis: OrderAnalysisService,
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

    /**
     * (Пере)анализ заказа: запускает джоб `analyse-order` (чтение приложений → позиции → обозначения).
     * Тело — {@link AnalyseOrderDto}: `deleteJobs` (умолч. true) супрессирует прежний прогон,
     * `deleteFileContent` (умолч. false) дополнительно сбрасывает вычитки FileContent.
     */
    @Post(':id/analyse')
    async analyse(@Param('id') id: string, @Body() body: AnalyseOrderDto): Promise<Stored<JobRun>> {
        await this.orders.getOrThrow(id);
        return this.orderAnalysis.analyse(id, body) as Promise<Stored<JobRun>>;
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

    /** Excel-отчёт по распознанной продукции заказа (скачивание xlsx). */
    @Get(':id/report')
    @BinaryResponse()
    async report(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
        await this.orders.getOrThrow(id);
        const buffer = await this.orderReport.buildWorkbook(id);
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="order-${id}.xlsx"`);
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
