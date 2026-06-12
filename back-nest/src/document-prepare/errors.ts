import { Data } from 'effect';
import type { YandexError } from '../yandex/yandex.service.js';

/** Ошибка извлечения содержимого файла в markdown (граница DPS-экстракторов и их тулзов). */
export class ExtractError extends Data.TaggedError('ExtractError')<{ readonly message: string }> {}

export const extractError = (message: string): ExtractError => new ExtractError({ message });

/** Преобразует ошибку Yandex в {@link ExtractError} для границы job. */
export const yandexToExtractError = (error: YandexError, fileId: string): ExtractError =>
    new ExtractError({ message: `Не удалось распознать файл "${fileId}" через Vision: ${error.message}` });
