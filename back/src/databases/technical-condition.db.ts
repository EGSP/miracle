import type { Stored, TechnicalCondition } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';

const technicalConditionsDb = registerDb(
    'technicalConditions',
    await JsonCollection.create<TechnicalCondition>('technical-conditions'),
);

declare module './db.js' {
    interface DbRegistry {
        technicalConditions: typeof technicalConditionsDb;
    }
}

export const technicalConditionsService = {
    create: async (data: TechnicalCondition): Promise<Stored<TechnicalCondition>> => {
        return technicalConditionsDb.create(data);
    },

    getAll: (): Stored<TechnicalCondition>[] => {
        return technicalConditionsDb.list();
    },

    getById: async (id: string): Promise<Stored<TechnicalCondition> | undefined> => {
        const row = await technicalConditionsDb.getById(id);
        return row;
    },

    getByProductTypeId: (productTypeId: string): Stored<TechnicalCondition>[] => {
        return technicalConditionsDb.list().filter((row) => row.productTypeId === productTypeId);
    },

    /**
     * Полная замена полезной нагрузки TC (без смены id и createdAt).
     * Тело запроса — объект {@link TechnicalCondition} целиком.
     */
    replace: async (id: string, data: TechnicalCondition): Promise<Stored<TechnicalCondition>> => {
        const existing = await technicalConditionsDb.getById(id);
        if (!existing) {
            throw new Error('Техническое условие не найдено');
        }
        const updated = await technicalConditionsDb.update(id, {
            fileId: data.fileId,
            productTypeId: data.productTypeId,
            rules: data.rules,
            designationSlots: data.designationSlots,
            displayTemplates: data.displayTemplates,
        });
        if (!updated) {
            throw new Error('Техническое условие не найдено');
        }
        return updated;
    },
};
