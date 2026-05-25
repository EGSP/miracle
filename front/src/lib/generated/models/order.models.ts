/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator. Не редактировать вручную.

export type CreateOrderDTO = {
    fileId?: string;
};

export type CanAnalyseOrderDetailsResponse = {
    canAnalyse: boolean;
    canForceReanalyse?: boolean;
    errorMessage?: string;
};

export type AnalyseOrderDetailsQuery = {
    forceReanalyse?: boolean;
};

export type AnalyseDesignationResponse = { workerId: string };

export type AnalyseOrderDetailsResponse = null;