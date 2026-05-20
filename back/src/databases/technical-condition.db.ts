import type { Stored, TechnicalCondition } from '@miracle/types';
import { prepareTechnicalConditionPayload } from '../lib/technical-condition/prepare-payload.js';
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
    create: async (body: TechnicalCondition): Promise<Stored<TechnicalCondition>> => {
        const data = await prepareTechnicalConditionPayload(body);
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
        return technicalConditionsDb
            .list()
            .filter((row) => row.productTypeId === productTypeId);
    },

    /**
     * Полная замена полезной нагрузки TC (без смены id и createdAt).
     */
    replace: async (id: string, body: TechnicalCondition): Promise<Stored<TechnicalCondition>> => {
        const existing = await technicalConditionsDb.getById(id);
        if (!existing) {
            throw new Error('Техническое условие не найдено');
        }
        const data = await prepareTechnicalConditionPayload(body, existing);
        const updated = await technicalConditionsDb.update(id, data);
        if (!updated) {
            throw new Error('Техническое условие не найдено');
        }
        return updated;
    },
};
