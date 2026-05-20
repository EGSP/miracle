import type { Stored, TechnicalCondition, TechnicalConditionsQuery } from '@miracle/types';
import { defineRouter, err, route } from '../app/index.js';
import { technicalConditionsService } from '../databases/technical-condition.db.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const getTechnicalConditions = route.get('/', {
    validate: { query: true },
    handler: async ({ query }: { query: TechnicalConditionsQuery }) => {
        if (query.productTypeId) {
            const items = technicalConditionsService.getByProductTypeId(query.productTypeId);
            return items satisfies Stored<TechnicalCondition>[];
        }
        const items = technicalConditionsService.getAll();
        return items satisfies Stored<TechnicalCondition>[];
    },
});

const createTechnicalCondition = route.post('/', {
    handler: async ({ body }: { body: TechnicalCondition }) => {
        const created = await technicalConditionsService.create(body);
        return created satisfies Stored<TechnicalCondition>;
    },
});

const getTechnicalCondition = route.get('/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const item = await technicalConditionsService.getById(params.id);
        if (!item) {
            return err.notFound('Technical condition not found');
        }
        return item satisfies Stored<TechnicalCondition>;
    },
});

const replaceTechnicalCondition = route.put('/:id', {
    validate: { params: true },
    handler: async ({
        params,
        body,
    }: {
        params: { id: string };
        body: TechnicalCondition;
    }) => {
        const existing = await technicalConditionsService.getById(params.id);
        if (!existing) {
            return err.notFound('Technical condition not found');
        }

        try {
            const updated = await technicalConditionsService.replace(params.id, body);
            return updated satisfies Stored<TechnicalCondition>;
        } catch {
            return err.notFound('Technical condition not found');
        }
    },
});

export const technicalConditionRouter = defineRouter('/technical-conditions', {
    middlewares: [authMiddleware],
    routes: [
        getTechnicalConditions,
        createTechnicalCondition,
        getTechnicalCondition,
        replaceTechnicalCondition,
    ],
} as const);
