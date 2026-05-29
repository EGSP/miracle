import { Injectable, NotFoundException } from '@nestjs/common';
import { hasDeletion, type ProductType, type Stored } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import type { CreateProductTypeDto } from './dto/create-product-type.dto.js';
import type { UpdateProductTypeDto } from './dto/update-product-type.dto.js';

@Injectable()
export class ProductTypesService {
    constructor(private readonly db: DatabaseService) {}

    create(dto: CreateProductTypeDto): Promise<Stored<ProductType>> {
        return this.db.collections.productTypes.create({
            name: dto.name,
            synonyms: dto.synonyms,
        });
    }

    getAll(): Stored<ProductType>[] {
        return this.db.collections.productTypes.list().filter((row) => !hasDeletion(row));
    }

    getByIdOrThrow(id: string): Stored<ProductType> {
        const row = this.db.collections.productTypes.getById(id);
        if (!row || hasDeletion(row)) {
            throw new NotFoundException(`Тип продукции ${id} не найден`);
        }
        return row;
    }

    async update(id: string, dto: UpdateProductTypeDto): Promise<Stored<ProductType>> {
        this.getByIdOrThrow(id);

        const patch: Partial<ProductType> = {};
        if (dto.name !== undefined) {
            patch.name = dto.name;
        }
        if (dto.synonyms !== undefined) {
            patch.synonyms = dto.synonyms;
        }

        const updated = await this.db.collections.productTypes.update(id, patch);
        if (!updated) {
            throw new NotFoundException(`Тип продукции ${id} не найден`);
        }
        return updated;
    }

    async softDelete(id: string): Promise<void> {
        this.getByIdOrThrow(id);
        await this.db.collections.productTypes.softDelete(id, true);
    }

    private normalizeName(value: string): string {
        return value.trim().replace(/\s+/g, ' ').toLowerCase();
    }

    findByName(name: string): Stored<ProductType> | undefined {
        const normalized = this.normalizeName(name);
        return this.db.collections.productTypes
            .ref()
            .find((item) => !hasDeletion(item) && this.normalizeName(item.name) === normalized);
    }

    findByNameOrSynonym(name: string): Stored<ProductType> | undefined {
        const normalized = this.normalizeName(name);
        return this.db.collections.productTypes
            .ref()
            .find((item) => !hasDeletion(item)
                && (this.normalizeName(item.name) === normalized
                    || item.synonyms.some((s) => this.normalizeName(s) === normalized)));
    }
}
