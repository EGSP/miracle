import { Injectable, NotFoundException } from '@nestjs/common';
import type { Order, OrderDetails, OrderQuery, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';

export type OrderAnalysisAvailability = {
    canAnalyse: boolean;
    canForceReanalyse?: boolean;
    errorMessage?: string;
};

@Injectable()
export class OrdersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly files: FilesService,
    ) {}

    async create(authorId: string, fileId?: string): Promise<Stored<Order>> {
        if (fileId && !(await this.files.get(fileId))) {
            throw new NotFoundException('Файл не найден');
        }
        const row = await this.prisma.order.create({
            data: { authorId, fileId: fileId ?? null, details: undefined },
        });
        return row as Stored<Order>;
    }

    async get(id: string): Promise<Stored<Order> | null> {
        const row = await this.prisma.order.findUnique({ where: { id } });
        return row as Stored<Order> | null;
    }

    async getOrThrow(id: string): Promise<Stored<Order>> {
        const order = await this.get(id);
        if (!order) {
            throw new NotFoundException('Заказ не найден');
        }
        return order;
    }

    async getOrders(query: OrderQuery): Promise<Stored<Order>[]> {
        const where: Record<string, unknown> = {};
        if (query.id !== undefined) where['id'] = query.id;
        if (query.authorId !== undefined) where['authorId'] = query.authorId;
        if (query.fileId !== undefined) where['fileId'] = query.fileId;

        const rows = await this.prisma.order.findMany({ where });
        return rows as Stored<Order>[];
    }

    async update(id: string, patch: Partial<Omit<Order, 'authorId'>>): Promise<Stored<Order>> {
        await this.getOrThrow(id);
        // Явно перечисляем поля: Prisma не принимает spread с условными полями в строго-типизированном data
        const data: Record<string, unknown> = {};
        if (patch.fileId !== undefined) data['fileId'] = patch.fileId;
        if (patch.details !== undefined) data['details'] = patch.details ?? null;

        const updated = await this.prisma.order.update({
            where: { id },
            data: data as Parameters<typeof this.prisma.order.update>[0]['data'],
        });
        return updated as Stored<Order>;
    }

    async clearAnalysedDetails(id: string): Promise<Stored<Order>> {
        await this.getOrThrow(id);
        const updated = await this.prisma.order.update({
            where: { id },
            data: { details: undefined },
        });
        return updated as Stored<Order>;
    }

    /** Можно ли запустить анализ деталей: файл доступен и нет активного прогона `order-analyse`. */
    async canAnalyseOrderDetails(id: string): Promise<OrderAnalysisAvailability> {
        const order = await this.get(id);
        if (!order) {
            return { canAnalyse: false, errorMessage: 'Заказ не найден' };
        }
        if (!order.fileId) {
            return { canAnalyse: false, errorMessage: 'У заказа не прикреплён файл' };
        }
        if (!(await this.files.get(order.fileId))) {
            return { canAnalyse: false, errorMessage: 'Файл заказа не найден' };
        }
        if (!(await this.files.checkFileAvailability(order.fileId))) {
            return { canAnalyse: false, errorMessage: 'Файл заказа недоступен' };
        }

        const active = await this.prisma.jobRun.findFirst({
            where: {
                job: 'order-analyse',
                status: 'running',
            },
        });
        if (active) {
            const input = active.input as { orderId?: string } | null;
            if (input?.orderId === id) {
                return { canAnalyse: false, canForceReanalyse: false, errorMessage: 'Для заказа уже выполняется анализ' };
            }
        }

        const details = order.details as OrderDetails | null;
        if (details != null) {
            return { canAnalyse: false, canForceReanalyse: true };
        }
        return { canAnalyse: true, canForceReanalyse: false };
    }
}
