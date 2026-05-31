/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { NewAuthTokens, Session, UserRole } from '@miracle/types';
export type { NewAuthTokens, Session, UserRole } from '@miracle/types';

export type CookieSessionResponse = {
    userId: string;
    role: UserRole;
};

export type OrderAnalysisAvailability = {
    canAnalyse: boolean;
    canForceReanalyse?: boolean;
    errorMessage?: string;
};