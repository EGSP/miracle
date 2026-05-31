import { SetMetadata } from '@nestjs/common';

export const BINARY_RESPONSE_KEY = 'binaryResponse';

/**
 * Маркер бинарного/стримингового ответа для client-generator-nest.
 * На клиенте эмитится `Blob` + `responseType: 'blob'`.
 * Рантайм не меняет поведение хэндлера — ответ по-прежнему пишется через `@Res() reply`.
 */
export const BinaryResponse = () => SetMetadata(BINARY_RESPONSE_KEY, true);
