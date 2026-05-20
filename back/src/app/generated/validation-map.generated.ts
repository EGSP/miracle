/* eslint-disable */
// Файл сгенерирован @miracle/tools backend-validation-generator. Не редактировать вручную.

import {
    parseGetUserParams,
    parseGetTokensParams,
    parseSoftDeleteQuery,
    parseSoftDeleteParams,
    parseGetContentQuery,
    parseGetContentParams,
    parseExtractContentQuery,
    parseExtractContentParams,
    parseGetFilesQuery,
    parsePatchFileParams,
    parseRestoreFileParams,
    parseStreamFileContentParams,
    parseGetOrderParams,
    parseGetOrdersQuery,
    parseCanAnalyseOrderDetailsParams,
    parseAnalyseOrderDetailsParams,
    parseClearAnalysedDetailsParams,
    parseGetWorkersQuery,
    parseApplyWorkerDataParams,
    parseDeleteWorkerParams,
    parseGetProductTypeParams,
    parseUpdateProductTypeParams,
    parseDeleteProductTypeParams,
} from './parsers.generated.js';

export const validationMap: Record<string, {
    query?: (raw: Record<string, unknown>) => unknown;
    params?: (raw: Record<string, unknown>) => unknown;
}> = {
    'GET /user/user/:id': { params: parseGetUserParams },
    'GET /files-content/records/:contentId/tokens': { params: parseGetTokensParams },
    'POST /files-content/records/:contentId': { query: parseSoftDeleteQuery, params: parseSoftDeleteParams },
    'GET /files-content/:fileId': { query: parseGetContentQuery, params: parseGetContentParams },
    'POST /files-content/:fileId/extract': { query: parseExtractContentQuery, params: parseExtractContentParams },
    'GET /files': { query: parseGetFilesQuery },
    'PATCH /files/:id': { params: parsePatchFileParams },
    'POST /files/:id/restore': { params: parseRestoreFileParams },
    'GET /files/:id/content': { params: parseStreamFileContentParams },
    'GET /order/:id': { params: parseGetOrderParams },
    'GET /order': { query: parseGetOrdersQuery },
    'GET /order/:id/can-analyse-details': { params: parseCanAnalyseOrderDetailsParams },
    'POST /order/:id/analyse-details': { params: parseAnalyseOrderDetailsParams },
    'POST /order/:id/clear-analysed-details': { params: parseClearAnalysedDetailsParams },
    'GET /workers': { query: parseGetWorkersQuery },
    'POST /workers/:id/apply-worker-data': { params: parseApplyWorkerDataParams },
    'DELETE /workers/:id': { params: parseDeleteWorkerParams },
    'GET /product-types/:id': { params: parseGetProductTypeParams },
    'PATCH /product-types/:id': { params: parseUpdateProductTypeParams },
    'DELETE /product-types/:id': { params: parseDeleteProductTypeParams },
};
