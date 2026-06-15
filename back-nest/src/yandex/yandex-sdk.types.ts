/**
 * Типы для промисифицированных клиентов Yandex Cloud SDK.
 *
 * ## Почему это нужно
 *
 * TypeScript-декларации в SDK сгенерированы напрямую из .proto-файлов через `protoc`.
 * gRPC по стандарту — callback-based API, поэтому все unary-методы в .d.ts описаны так:
 *
 *   completion(request: CompletionRequest, callback: (err, res: Operation) => void): ClientUnaryCall
 *
 * Yandex SDK поверх этого добавляет промисификацию в рантайме (внутри `session.client()`).
 * Типы при этом не обновляются — они остаются callback-API, хотя реально методы возвращают Promise.
 *
 * ## Правило применения
 *
 * Этот файл нужен только для **unary-вызовов** (один запрос → один ответ). При создании клиента:
 * `session.client(ServiceClient) as unknown as Async<ServiceName>Client`.
 */

import type { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation_models-v1';
import type { operation } from '@yandex-cloud/nodejs-sdk/operation';

/**
 * Промисифицированный клиент асинхронной генерации текста (YandexGPT).
 *
 * Оригинал: `textGenerationService.TextGenerationAsyncServiceClient`
 *
 * Unary-методы:
 * - `completion` — запускает фоновую генерацию, возвращает `Operation`
 */
export type AsyncLlmClient = {
    completion(request: textGenerationService.CompletionRequest): Promise<operation.Operation>;
};

/**
 * Промисифицированный клиент сервиса операций Yandex Cloud.
 *
 * Оригинал: `operationService.OperationServiceClient`
 *
 * Используется для однократной проверки статуса операции без блокирующего polling.
 */
export type AsyncOperationClient = {
    get(request: { operationId: string }): Promise<operation.Operation>;
};
