import { hasDeletion, type ProductType, type Stored } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';

const productTypeDb = registerDb('productTypes', await JsonCollection.create<ProductType>('product-types'));

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
        return productTypeDb.list().filter((row) => !hasDeletion(row));
    },

    getById: async (id: string): Promise<Stored<ProductType> | undefined> => {
        const row = await productTypeDb.getById(id);
        if (!row || hasDeletion(row)) {
            return undefined;
        }
        return row;
    },

    update: async (id: string, patch: Partial<ProductType>): Promise<Stored<ProductType>> => {
        const existing = await productTypeDb.getById(id);
        if (!existing || hasDeletion(existing)) {
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
            .find((item) => !hasDeletion(item) && normalizeName(item.name) === normalized);
    },

    findByNameOrSynonym: (name: string): Stored<ProductType> | undefined => {
        const normalized = normalizeName(name);
        return productTypeDb
            .ref()
            .find((item) => !hasDeletion(item)
                && (normalizeName(item.name) === normalized
                    || item.synonyms.some((s) => normalizeName(s) === normalized)));
    },
};
