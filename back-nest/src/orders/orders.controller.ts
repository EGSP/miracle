import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    NotImplementedException,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Order, OrderApplication, OrderQuery, Stored } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { UploadedFile } from '../common/uploaded-file.decorator.js';
import { FilesService } from '../files/files.service.js';
import { OrdersService } from './orders.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { CreateTextApplicationDto } from './dto/create-text-application.dto.js';

@Controller('order')
@UseGuards(AuthGuard)
export class OrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly orderApplications: OrderApplicationsService,
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

    // Анализ переезжает на уровень приложений/позиций. Воркеры будут отрефакторены отдельно —
    // до тех пор эндпоинты, запускавшие джобы, отвечают 501.
    @Post('analyse-designation')
    analyseDesignation(): never {
        throw new NotImplementedException('Анализ обозначения переносится на позиции приложения');
    }

    @Post(':id/analyse-details')
    analyseDetails(): never {
        throw new NotImplementedException('Анализ заявки переносится на позиции приложения');
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
