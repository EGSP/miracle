/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { DesignationWorkerInput, Order, OrderApplication, OrderQuery, Stored } from '@miracle/types';
import type { OrdersAnalyseDesignationResponse, OrderAnalysisAvailability, OrdersAnalyseDetailsResponse, CreateTextApplicationDto } from './models';

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
    listApplications: (id: string) => customInstance<Stored<OrderApplication>[]>({
        method: 'GET',
        url: formatPath('/order/:id/applications', { id }),
    }),
    addFileApplication: (id: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return customInstance<Stored<OrderApplication>>({
        method: 'POST',
        url: formatPath('/order/:id/applications/file', { id }),
        data: formData,
        });
    },
    addTextApplication: (id: string, createTextApplicationDto: CreateTextApplicationDto) => customInstance<Stored<OrderApplication>>({
        method: 'POST',
        url: formatPath('/order/:id/applications/text', { id }),
        data: createTextApplicationDto,
    }),
    removeApplication: (id: string, appId: string) => customInstance<Stored<OrderApplication>>({
        method: 'DELETE',
        url: formatPath('/order/:id/applications/:appId', { id, appId }),
    }),
};
