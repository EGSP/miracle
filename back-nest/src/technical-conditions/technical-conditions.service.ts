import { Injectable, NotFoundException } from '@nestjs/common';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import { ProductTypesService } from '../product-types/product-types.service.js';

@Injectable()
export class TechnicalConditionsService {
    constructor(
        private readonly db: DatabaseService,
        private readonly productTypes: ProductTypesService,
    ) {}

    getAll(): Stored<TechnicalCondition>[] {
        return this.db.collections.technicalConditions.list();
    }

    getByProductTypeId(productTypeId: string): Stored<TechnicalCondition>[] {
        return this.getAll().filter((row) => row.productTypeId === productTypeId);
    }

    getById(id: string): Stored<TechnicalCondition> | undefined {
        return this.db.collections.technicalConditions.getById(id);
    }

    getByIdOrThrow(id: string): Stored<TechnicalCondition> {
        const row = this.getById(id);
        if (!row) {
            throw new NotFoundException('Технического условия не существует');
        }
        return row;
    }

    create(body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        return this.db.collections.technicalConditions.create(this.preparePayload(body));
    }

    /** Полная замена полезной нагрузки TC (без смены id/createdAt). */
    async replace(id: string, body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        const existing = this.getById(id);
        if (!existing) {
            throw new NotFoundException('Технического условия не существует');
        }
        const updated = await this.db.collections.technicalConditions.update(
            id,
            this.preparePayload(body, existing),
        );
        if (!updated) {
            throw new NotFoundException('Технического условия не существует');
        }
        return updated;
    }

    /** Нормализует тело TC: trim, дефолты массивов, `lastProductTypeName` по правилам productTypeId. */
    private preparePayload(
        body: TechnicalCondition,
        existing?: Stored<TechnicalCondition>,
    ): TechnicalCondition {
        const name = body.name?.trim() || undefined;
        const productTypeId = body.productTypeId?.trim() || undefined;
        const fileId = body.fileId?.trim() || undefined;

        let lastProductTypeName: string | undefined;
        if (productTypeId) {
            const productType = this.productTypes.getById(productTypeId);
            lastProductTypeName =
                productType?.name ?? body.lastProductTypeName?.trim() ?? existing?.lastProductTypeName;
        } else {
            lastProductTypeName = body.lastProductTypeName?.trim() || existing?.lastProductTypeName;
        }

        return {
            name,
            fileId,
            productTypeId,
            lastProductTypeName,
            rules: body.rules ?? [],
            designationSlots: body.designationSlots ?? [],
            displayTemplates: body.displayTemplates ?? [],
        };
    }
}
