import { Injectable } from '@nestjs/common';
import type { Designation, DesignationValue, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';

type DesignationRow = {
    id: string;
    orderPositionId: string;
    tcId: string;
    values: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
};

function toDesignation(row: DesignationRow): Stored<Designation> {
    return {
        id: row.id,
        orderPositionId: row.orderPositionId,
        tcId: row.tcId,
        values: (row.values ?? []) as DesignationValue[],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
    } as unknown as Stored<Designation>;
}

@Injectable()
export class DesignationsService {
    constructor(private readonly prisma: PrismaService) {}

    async getByPosition(orderPositionId: string): Promise<Stored<Designation> | null> {
        const row = await this.prisma.designation.findUnique({ where: { orderPositionId } });
        return row ? toDesignation(row as DesignationRow) : null;
    }

    /** Обозначения для набора позиций одним запросом (для списка продукции заказа). */
    async listByPositions(orderPositionIds: string[]): Promise<Stored<Designation>[]> {
        if (orderPositionIds.length === 0) return [];
        const rows = await this.prisma.designation.findMany({
            where: { orderPositionId: { in: orderPositionIds }, deletedAt: null },
        });
        return rows.map((row) => toDesignation(row as DesignationRow));
    }

    /** Жёсткое удаление обозначений перечисленных позиций (чистый лист при переанализе). */
    async deleteByPositions(orderPositionIds: string[]): Promise<void> {
        if (orderPositionIds.length === 0) return;
        await this.prisma.designation.deleteMany({ where: { orderPositionId: { in: orderPositionIds } } });
    }

    /** Создаёт или перезаписывает обозначение позиции (1:1 по orderPositionId). */
    async upsert(orderPositionId: string, tcId: string, values: DesignationValue[]): Promise<Stored<Designation>> {
        const row = await this.prisma.designation.upsert({
            where: { orderPositionId },
            create: { orderPositionId, tcId, values: values as object },
            update: { tcId, values: values as object },
        });
        return toDesignation(row as DesignationRow);
    }
}
