import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateOrderSchema, type Order, type OrderQuery, type Stored } from '@miracle/types';
import type { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';

type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;

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

        const rows = await this.prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        return rows as Stored<Order>[];
    }

    async update(id: string, input: UpdateOrderInput): Promise<Stored<Order>> {
        await this.getOrThrow(id);
        const data: { name?: string | null } = {};
        if (input.name !== undefined) {
            const trimmed = input.name?.trim();
            data.name = trimmed ? trimmed : null;
        }
        const row = await this.prisma.order.update({ where: { id }, data });
        return row as Stored<Order>;
    }
}
