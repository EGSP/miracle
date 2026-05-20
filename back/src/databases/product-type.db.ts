import type { ProductType, Stored } from '@miracle/types';
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
        return productTypeDb.list();
    },

    getById: async (id: string): Promise<Stored<ProductType> | undefined> => {
        return productTypeDb.getById(id);
    },

    update: async (id: string, patch: Partial<ProductType>): Promise<Stored<ProductType>> => {
        const updated = await productTypeDb.update(id, patch);
        if (!updated) {
            throw new Error('Тип продукции не найден');
        }
        return updated;
    },

    delete: async (id: string): Promise<void> => {
        const deleted = await productTypeDb.delete(id);
        if (!deleted) {
            throw new Error('Тип продукции не найден');
        }
    },

    findByName: (name: string): Stored<ProductType> | undefined => {
        const normalized = normalizeName(name);
        return productTypeDb.ref().find((item) => normalizeName(item.name) === normalized);
    },
};
