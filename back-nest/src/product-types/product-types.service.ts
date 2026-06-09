import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProductType, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateProductTypeDto } from './dto/create-product-type.dto.js';
import type { UpdateProductTypeDto } from './dto/update-product-type.dto.js';

@Injectable()
export class ProductTypesService {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateProductTypeDto): Promise<Stored<ProductType>> {
        const row = await this.prisma.productType.create({
            data: { name: dto.name, synonyms: dto.synonyms },
        });
        return row as Stored<ProductType>;
    }

    async getAll(): Promise<Stored<ProductType>[]> {
        const rows = await this.prisma.productType.findMany({
            where: { deletedAt: null },
        });
        return rows as Stored<ProductType>[];
    }

    async getById(id: string): Promise<Stored<ProductType> | null> {
        const row = await this.prisma.productType.findFirst({
            where: { id, deletedAt: null },
        });
        return row as Stored<ProductType> | null;
    }

    async getByIdOrThrow(id: string): Promise<Stored<ProductType>> {
        const row = await this.getById(id);
        if (!row) {
            throw new NotFoundException(`Тип продукции ${id} не найден`);
        }
        return row;
    }

    /** Активные ТУ, привязанные к типу продукции (облегчённые id + name). */
    async getLinkedTechnicalConditions(
        productTypeId: string,
    ): Promise<Array<{ id: string; name: string | null }>> {
        await this.getByIdOrThrow(productTypeId);

        const rows = await this.prisma.technicalCondition.findMany({
            where: { productTypeId, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        return rows.map((row) => ({ id: row.id, name: row.name }));
    }

    async update(id: string, dto: UpdateProductTypeDto): Promise<Stored<ProductType>> {
        await this.getByIdOrThrow(id);

        const data: Partial<{ name: string; synonyms: string[] }> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.synonyms !== undefined) data.synonyms = dto.synonyms;

        const updated = await this.prisma.productType.update({ where: { id }, data });
        return updated as Stored<ProductType>;
    }

    async softDelete(id: string): Promise<void> {
        await this.getByIdOrThrow(id);
        await this.prisma.productType.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    private normalizeName(value: string): string {
        return value.trim().replace(/\s+/g, ' ').toLowerCase();
    }

    async findByName(name: string): Promise<Stored<ProductType> | null> {
        const normalized = this.normalizeName(name);
        const rows = await this.prisma.productType.findMany({ where: { deletedAt: null } });
        const found = rows.find((item) => this.normalizeName(item.name) === normalized);
        return (found ?? null) as Stored<ProductType> | null;
    }

    async findByNameOrSynonym(name: string): Promise<Stored<ProductType> | null> {
        const normalized = this.normalizeName(name);
        const rows = await this.prisma.productType.findMany({ where: { deletedAt: null } });
        const found = rows.find((item) => {
            if (this.normalizeName(item.name) === normalized) return true;
            const synonyms = item.synonyms as string[];
            return synonyms.some((s) => this.normalizeName(s) === normalized);
        });
        return (found ?? null) as Stored<ProductType> | null;
    }
}
