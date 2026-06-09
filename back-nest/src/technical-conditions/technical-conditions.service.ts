import { Injectable, NotFoundException } from '@nestjs/common';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { ProductTypesService } from '../product-types/product-types.service.js';

@Injectable()
export class TechnicalConditionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly productTypes: ProductTypesService,
    ) {}

    async getAll(): Promise<Stored<TechnicalCondition>[]> {
        const rows = await this.prisma.technicalCondition.findMany({ where: { deletedAt: null } });
        return rows as Stored<TechnicalCondition>[];
    }

    /** Активные ТУ по типу продукции. Мягко удалённые (deletedAt) исключены — их не учитывает резолв designation. */
    async getByProductTypeId(productTypeId: string): Promise<Stored<TechnicalCondition>[]> {
        const rows = await this.prisma.technicalCondition.findMany({
            where: { productTypeId, deletedAt: null },
        });
        return rows as Stored<TechnicalCondition>[];
    }

    async getById(id: string): Promise<Stored<TechnicalCondition> | null> {
        // findFirst (не findUnique): к id добавляем фильтр deletedAt — мягко удалённые невидимы везде.
        const row = await this.prisma.technicalCondition.findFirst({ where: { id, deletedAt: null } });
        return row as Stored<TechnicalCondition> | null;
    }

    async getByIdOrThrow(id: string): Promise<Stored<TechnicalCondition>> {
        const row = await this.getById(id);
        if (!row) {
            throw new NotFoundException('Технического условия не существует');
        }
        return row;
    }

    async create(body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        const payload = await this.preparePayload(body);
        const row = await this.prisma.technicalCondition.create({ data: payload });
        return row as Stored<TechnicalCondition>;
    }

    /** Мягкое удаление ТУ: проставляет `deletedAt`. Удалённое ТУ исчезает из списков и резолва designation. */
    async softDelete(id: string): Promise<Stored<TechnicalCondition>> {
        await this.getByIdOrThrow(id);
        const updated = await this.prisma.technicalCondition.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        return updated as Stored<TechnicalCondition>;
    }

    /** Полная замена полезной нагрузки TC (без смены id/createdAt). */
    async replace(id: string, body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        const existing = await this.getByIdOrThrow(id);
        const payload = await this.preparePayload(body, existing);
        const updated = await this.prisma.technicalCondition.update({ where: { id }, data: payload });
        return updated as Stored<TechnicalCondition>;
    }

    /** Нормализует тело TC: trim, дефолты массивов, `lastProductTypeName` по правилам productTypeId. */
    private async preparePayload(
        body: TechnicalCondition,
        existing?: Stored<TechnicalCondition>,
    ): Promise<Record<string, unknown>> {
        const name = body.name?.trim() || undefined;
        const productTypeId = body.productTypeId?.trim() || undefined;
        const fileId = body.fileId?.trim() || undefined;

        let lastProductTypeName: string | undefined;
        if (productTypeId) {
            const productType = await this.productTypes.getById(productTypeId);
            lastProductTypeName =
                productType?.name ?? body.lastProductTypeName?.trim() ?? existing?.lastProductTypeName;
        } else {
            lastProductTypeName = body.lastProductTypeName?.trim() || existing?.lastProductTypeName;
        }

        const designationDecodeExamples = body.designationDecodeExamples?.trim() || undefined;

        return {
            name,
            fileId,
            productTypeId,
            lastProductTypeName,
            slotRules: body.slotRules ?? [],
            designationDecodeExamples,
            displayTemplates: body.displayTemplates ?? [],
        };
    }
}
