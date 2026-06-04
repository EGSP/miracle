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
