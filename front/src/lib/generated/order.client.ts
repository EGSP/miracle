/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { DesignationWorkerInput, Order, OrderQuery, Stored } from '@miracle/types';
import type { CreateOrderDTO, CanAnalyseOrderDetailsResponse, AnalyseOrderDetailsResponse, AnalyseDesignationResponse } from './models';

export const order = {
    createOrder: (createOrderDTO: CreateOrderDTO) => customInstance<Stored<Order>>({
        method: 'POST',
        url: '/order/create',
        data: createOrderDTO,
    }),
    getOrder: (params: { id: string; }) => customInstance<Stored<Order>>({
        method: 'GET',
        url: formatPath('/order/:id', params),
    }),
    getOrders: (orderQuery: OrderQuery) => customInstance<Stored<Order>[]>({
        method: 'GET',
        url: '/order',
        params: orderQuery,
    }),
    updateOrder: (params: { id: string; }, body: Partial<Pick<Order, "fileId" | "details">>) => customInstance<Stored<Order>>({
        method: 'PUT',
        url: formatPath('/order/:id', params),
        data: body,
    }),
    canAnalyseOrderDetails: (params: { id: string; }) => customInstance<CanAnalyseOrderDetailsResponse>({
        method: 'GET',
        url: formatPath('/order/:id/can-analyse-details', params),
    }),
    analyseOrderDetails: (params: { id: string; }) => customInstance<AnalyseOrderDetailsResponse>({
        method: 'POST',
        url: formatPath('/order/:id/analyse-details', params),
    }),
    clearAnalysedDetails: (params: { id: string; }) => customInstance<Stored<Order>>({
        method: 'POST',
        url: formatPath('/order/:id/clear-analysed-details', params),
    }),
    analyseDesignation: (designationWorkerInput: DesignationWorkerInput) => customInstance<AnalyseDesignationResponse>({
        method: 'POST',
        url: '/order/analyse-designation',
        data: designationWorkerInput,
    }),
};
