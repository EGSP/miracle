import type { YandexError } from '../yandex/yandex.service.js';
import type { ExtractError } from './extractor.port.js';

export const extractError = (message: string): ExtractError => ({ _tag: 'ExtractError', message });

export const isExtractError = (error: unknown): error is ExtractError =>
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    (error as ExtractError)._tag === 'ExtractError';

/** Преобразует ошибку Yandex в ExtractError для границы job. */
export const yandexToExtractError = (error: YandexError, fileId: string): ExtractError => ({
    _tag: 'ExtractError',
    message: `Не удалось распознать файл "${fileId}" через Vision: ${error.message}`,
});
