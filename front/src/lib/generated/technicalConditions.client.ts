/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { Stored, TechnicalCondition } from '@miracle/types';
import type { TechnicalConditionsGetLinkedProductTypeResponse, TechnicalConditionsExtractDetailsResponse } from './models';

export const technicalConditions = {
    list: (query: { productTypeId?: string }) => customInstance<Stored<TechnicalCondition>[]>({
        method: 'GET',
        url: '/technical-conditions',
        params: query,
    }),
    create: (technicalCondition: TechnicalCondition) => customInstance<Stored<TechnicalCondition>>({
        method: 'POST',
        url: '/technical-conditions',
        data: technicalCondition,
    }),
    getLinkedProductType: (id: string) => customInstance<TechnicalConditionsGetLinkedProductTypeResponse>({
        method: 'GET',
        url: formatPath('/technical-conditions/:id/product-type', { id }),
    }),
    getOne: (id: string) => customInstance<Stored<TechnicalCondition>>({
        method: 'GET',
        url: formatPath('/technical-conditions/:id', { id }),
    }),
    replace: (id: string, technicalCondition: TechnicalCondition) => customInstance<Stored<TechnicalCondition>>({
        method: 'PUT',
        url: formatPath('/technical-conditions/:id', { id }),
        data: technicalCondition,
    }),
    remove: (id: string) => customInstance<Stored<TechnicalCondition>>({
        method: 'DELETE',
        url: formatPath('/technical-conditions/:id', { id }),
    }),
    extractDetails: (id: string) => customInstance<TechnicalConditionsExtractDetailsResponse>({
        method: 'POST',
        url: formatPath('/technical-conditions/:id/extract-details', { id }),
    }),
};
