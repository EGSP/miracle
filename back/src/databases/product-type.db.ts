import type { ProductType, Stored } from '@miracle/types';
import { JsonCollection, registerDb, type StoredEntity } from './db.js';

const productTypeDb = registerDb('productTypes', await JsonCollection.create<ProductType>('product-types'));

function isActiveProductType(row: StoredEntity<ProductType>): boolean {
    return row.deletedAt == null;
}

declare module './db.js' {
    interface DbRegistry {
        productTypes: typeof productTypeDb;
    }
}

function normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const productTypesService = {
    create: async (data: ProductType): Promise<Stored<ProductType>> => {
        return productTypeDb.create(data);
    },

    getAll: (): Stored<ProductType>[] => {
        return productTypeDb.list().filter(isActiveProductType);
    },

    getById: async (id: string): Promise<Stored<ProductType> | undefined> => {
        const row = await productTypeDb.getById(id);
        if (!row || !isActiveProductType(row)) {
            return undefined;
        }
        return row;
    },

    update: async (id: string, patch: Partial<ProductType>): Promise<Stored<ProductType>> => {
        const existing = await productTypeDb.getById(id);
        if (!existing || !isActiveProductType(existing)) {
            throw new Error('Тип продукции не найден');
        }
        const updated = await productTypeDb.update(id, patch);
        if (!updated) {
            throw new Error('Тип продукции не найден');
        }
        return updated;
    },

    /** Мягкое удаление: запись остаётся в БД с `deletedAt`. */
    softDelete: async (id: string): Promise<void> => {
        const row = await productTypeDb.getById(id);
        if (!row) {
            throw new Error('Тип продукции не найден');
        }
        await productTypeDb.softDelete(id, true);
    },

    findByName: (name: string): Stored<ProductType> | undefined => {
        const normalized = normalizeName(name);
        return productTypeDb
            .ref()
            .find((item) => isActiveProductType(item) && normalizeName(item.name) === normalized);
    },
};
