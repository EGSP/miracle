/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

export type HealthResponse = {
    status: 'ok';
    timestamp: string;
    kreuzberg: {
        status: 'up' | 'down';
        version?: string;
        error?: string;
    };
};