import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderPosition, OrderPositionData, OrderPositionWithDesignation, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { DesignationsService } from './designations.service.js';

/** Поля позиции, которые можно задать при создании/обновлении (без системных полей БД и `applicationId`). */
export type OrderPositionPatch = Partial<
    Pick<OrderPosition, 'name' | 'productTypeId' | 'productTypeName' | 'data'>
>;

type PositionRow = {
    id: string;
    applicationId: string;
    name: string;
    productTypeId: string | null;
    productTypeName: string | null;
    data: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
};

/** Строка БД → доменная позиция (поля уже плоские; `null` колонок → `undefined`). */
function toPosition(row: PositionRow): Stored<OrderPosition> {
    return {
        id: row.id,
        applicationId: row.applicationId,
        name: row.name,
        ...(row.productTypeId != null ? { productTypeId: row.productTypeId } : {}),
        ...(row.productTypeName != null ? { productTypeName: row.productTypeName } : {}),
        data: row.data as OrderPositionData,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
    } as unknown as Stored<OrderPosition>;
}

@Injectable()
export class OrderPositionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly applications: OrderApplicationsService,
        private readonly designations: DesignationsService,
    ) {}

    async listByApplication(applicationId: string): Promise<Stored<OrderPosition>[]> {
        const rows = await this.prisma.orderPosition.findMany({
            where: { applicationId, deletedAt: null },
        });
        return rows.map((row) => toPosition(row as PositionRow));
    }

    /**
     * Все позиции заказа (по его приложениям) вместе с их обозначениями (1:1, `null` если нет).
     * Обозначения подтягиваются одним запросом и раскладываются по `orderPositionId`.
     */
    async listByOrderWithDesignations(orderId: string): Promise<OrderPositionWithDesignation[]> {
        const apps = await this.applications.listByOrder(orderId);
        const positionLists = await Promise.all(apps.map((app) => this.listByApplication(app.id)));
        const positions = positionLists.flat();

        const designations = await this.designations.listByPositions(positions.map((p) => p.id));
        const byPosition = new Map(designations.map((d) => [d.orderPositionId, d]));

        return positions.map((position) => ({
            position,
            designation: byPosition.get(position.id) ?? null,
        }));
    }

    async get(id: string): Promise<Stored<OrderPosition> | null> {
        const row = await this.prisma.orderPosition.findUnique({ where: { id } });
        return row ? toPosition(row as PositionRow) : null;
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
                name: input.name,
                productTypeId: input.productTypeId ?? null,
                productTypeName: input.productTypeName ?? null,
                data: input.data as object,
            },
        });
        return toPosition(row as PositionRow);
    }

    async update(id: string, patch: OrderPositionPatch): Promise<Stored<OrderPosition>> {
        await this.getOrThrow(id);
        const row = await this.prisma.orderPosition.update({
            where: { id },
            data: {
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.productTypeId !== undefined ? { productTypeId: patch.productTypeId ?? null } : {}),
                ...(patch.productTypeName !== undefined ? { productTypeName: patch.productTypeName ?? null } : {}),
                ...(patch.data !== undefined ? { data: patch.data as object } : {}),
            },
        });
        return toPosition(row as PositionRow);
    }

    /** Жёсткое удаление перечисленных позиций (для перезаписи прогоном извлечения). */
    async deleteMany(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        await this.prisma.orderPosition.deleteMany({ where: { id: { in: ids } } });
    }

    /** Жёсткое удаление всех позиций перечисленных приложений (чистый лист при переанализе). */
    async deleteByApplications(applicationIds: string[]): Promise<void> {
        if (applicationIds.length === 0) return;
        await this.prisma.orderPosition.deleteMany({ where: { applicationId: { in: applicationIds } } });
    }
}
