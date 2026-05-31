/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { DesignationWorkerInput, Order, OrderQuery, Stored } from '@miracle/types';
import type { OrdersAnalyseDesignationResponse, OrderAnalysisAvailability, OrdersAnalyseDetailsResponse } from './models';

export const orders = {
    create: (body: { fileId?: string }) => customInstance<Stored<Order>>({
        method: 'POST',
        url: '/order/create',
        data: body,
    }),
    analyseDesignation: (designationWorkerInput: DesignationWorkerInput) => customInstance<OrdersAnalyseDesignationResponse>({
        method: 'POST',
        url: '/order/analyse-designation',
        data: designationWorkerInput,
    }),
    list: (orderQuery: OrderQuery) => customInstance<Stored<Order>[]>({
        method: 'GET',
        url: '/order',
        params: orderQuery,
    }),
    getOne: (id: string) => customInstance<Stored<Order>>({
        method: 'GET',
        url: formatPath('/order/:id', { id }),
    }),
    update: (id: string, body: Partial<Pick<Order, 'fileId' | 'details'>>) => customInstance<Stored<Order>>({
        method: 'PUT',
        url: formatPath('/order/:id', { id }),
        data: body,
    }),
    canAnalyse: (id: string) => customInstance<OrderAnalysisAvailability>({
        method: 'GET',
        url: formatPath('/order/:id/can-analyse-details', { id }),
    }),
    analyseDetails: (id: string, query: { forceReanalyse?: string }) => customInstance<OrdersAnalyseDetailsResponse>({
        method: 'POST',
        url: formatPath('/order/:id/analyse-details', { id }),
        params: query,
    }),
    clearAnalysed: (id: string) => customInstance<Stored<Order>>({
        method: 'POST',
        url: formatPath('/order/:id/clear-analysed-details', { id }),
    }),
};
