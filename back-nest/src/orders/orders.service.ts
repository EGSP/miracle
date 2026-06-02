import { Injectable, NotFoundException } from '@nestjs/common';
import type { Order, OrderQuery, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class OrdersService {
    constructor(private readonly prisma: PrismaService) {}

    async create(authorId: string): Promise<Stored<Order>> {
        const row = await this.prisma.order.create({ data: { authorId } });
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

        const rows = await this.prisma.order.findMany({ where });
        return rows as Stored<Order>[];
    }
}
