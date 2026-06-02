import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderPosition, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';

/** Поля позиции, которые можно задать при создании/обновлении (без системных полей БД и `applicationId`). */
export type OrderPositionPatch = Partial<Omit<OrderPosition, 'applicationId'>>;

@Injectable()
export class OrderPositionsService {
    constructor(private readonly prisma: PrismaService) {}

    async listByApplication(applicationId: string): Promise<Stored<OrderPosition>[]> {
        const rows = await this.prisma.orderPosition.findMany({
            where: { applicationId, deletedAt: null },
        });
        return rows as Stored<OrderPosition>[];
    }

    async get(id: string): Promise<Stored<OrderPosition> | null> {
        const row = await this.prisma.orderPosition.findUnique({ where: { id } });
        return row as Stored<OrderPosition> | null;
    }

    async getOrThrow(id: string): Promise<Stored<OrderPosition>> {
        const position = await this.get(id);
        if (!position) {
            throw new NotFoundException('Позиция не найдена');
        }
        return position;
    }

    async create(input: OrderPosition): Promise<Stored<OrderPosition>> {
        const row = await this.prisma.orderPosition.create({
            data: {
                applicationId: input.applicationId,
                productTypeId: input.productTypeId,
                productTypeName: input.productTypeName,
                requirements: input.requirements,
                designation: input.designation,
            },
        });
        return row as Stored<OrderPosition>;
    }

    async update(id: string, patch: OrderPositionPatch): Promise<Stored<OrderPosition>> {
        await this.getOrThrow(id);
        const row = await this.prisma.orderPosition.update({
            where: { id },
            data: {
                ...(patch.productTypeId !== undefined ? { productTypeId: patch.productTypeId } : {}),
                ...(patch.productTypeName !== undefined ? { productTypeName: patch.productTypeName } : {}),
                ...(patch.requirements !== undefined ? { requirements: patch.requirements } : {}),
                ...(patch.designation !== undefined ? { designation: patch.designation } : {}),
            },
        });
        return row as Stored<OrderPosition>;
    }
}
