/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { JobRun, Order, OrderApplication, OrderQuery, Stored } from '@miracle/types';
import type { AnalyseOrderDto, CreateTextApplicationDto } from './models';

export const orders = {
    create: () => customInstance<Stored<Order>>({
        method: 'POST',
        url: '/order/create',
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
    analyse: (id: string, analyseOrderDto: AnalyseOrderDto) => customInstance<Stored<JobRun>>({
        method: 'POST',
        url: formatPath('/order/:id/analyse', { id }),
        data: analyseOrderDto,
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
