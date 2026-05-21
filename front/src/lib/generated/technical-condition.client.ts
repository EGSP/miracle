/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { Stored, TechnicalCondition, TechnicalConditionsQuery } from '@miracle/types';
import type { ExtractTcDetailsResponse } from './models';

export const technicalCondition = {
    getTechnicalConditions: (technicalConditionsQuery: TechnicalConditionsQuery) => customInstance<Stored<TechnicalCondition>[]>({
        method: 'GET',
        url: '/technical-conditions',
        params: technicalConditionsQuery,
    }),
    createTechnicalCondition: (technicalCondition: TechnicalCondition) => customInstance<Stored<TechnicalCondition>>({
        method: 'POST',
        url: '/technical-conditions',
        data: technicalCondition,
    }),
    getTechnicalCondition: (params: { id: string; }) => customInstance<Stored<TechnicalCondition>>({
        method: 'GET',
        url: formatPath('/technical-conditions/:id', params),
    }),
    replaceTechnicalCondition: (params: { id: string; }, technicalCondition: TechnicalCondition) => customInstance<Stored<TechnicalCondition>>({
        method: 'PUT',
        url: formatPath('/technical-conditions/:id', params),
        data: technicalCondition,
    }),
    extractTcDetails: (params: { id: string; }) => customInstance<ExtractTcDetailsResponse>({
        method: 'POST',
        url: formatPath('/technical-conditions/:id/extract-details', params),
    }),
};
