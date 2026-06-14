/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { AnalysisParamDef, AnalysisReadiness, AnalysisVariantInfo, JobRun, Order, OrderApplication, OrderPositionWithDesignation, OrderQuery, OrderReportInfo, Stored } from '@miracle/types';
import type { UpdateOrderDto, AnalyseOrderRequestDto, CreateTextApplicationDto } from './models';

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
    update: (id: string, updateOrderDto: UpdateOrderDto) => customInstance<Stored<Order>>({
        method: 'PATCH',
        url: formatPath('/order/:id', { id }),
        data: updateOrderDto,
    }),
    analyse: (id: string, analyseOrderRequestDto: AnalyseOrderRequestDto) => customInstance<Stored<JobRun>>({
        method: 'POST',
        url: formatPath('/order/:id/analyse', { id }),
        data: analyseOrderRequestDto,
    }),
    listAnalysisVariants: (id: string) => customInstance<AnalysisVariantInfo[]>({
        method: 'GET',
        url: formatPath('/order/:id/analysis-variants', { id }),
    }),
    getAnalysisParams: (id: string, variantId: string) => customInstance<AnalysisParamDef[]>({
        method: 'GET',
        url: formatPath('/order/:id/analysis-variants/:variantId/params', { id, variantId }),
    }),
    analysisReadiness: (id: string, query: { variantId: string }) => customInstance<AnalysisReadiness>({
        method: 'GET',
        url: formatPath('/order/:id/analysis-readiness', { id }),
        params: query,
    }),
    getJob: (id: string) => customInstance<Stored<JobRun> | null>({
        method: 'GET',
        url: formatPath('/order/:id/job', { id }),
    }),
    listApplications: (id: string) => customInstance<Stored<OrderApplication>[]>({
        method: 'GET',
        url: formatPath('/order/:id/applications', { id }),
    }),
    listPositions: (id: string) => customInstance<OrderPositionWithDesignation[]>({
        method: 'GET',
        url: formatPath('/order/:id/positions', { id }),
    }),
    listReports: (id: string) => customInstance<OrderReportInfo[]>({
        method: 'GET',
        url: formatPath('/order/:id/reports', { id }),
    }),
    report: (id: string, query: { reportId?: string | undefined }) => customInstance<Blob>({
        method: 'GET',
        url: formatPath('/order/:id/report', { id }),
        params: query,
        responseType: 'blob',
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
