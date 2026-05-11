/**
 * Типы для промисифицированных клиентов Yandex Cloud SDK.
 *
 * ## Почему это нужно
 *
 * TypeScript-декларации в SDK сгенерированы напрямую из .proto-файлов через `protoc`.
 * gRPC по стандарту — callback-based API, поэтому все unary-методы в .d.ts описаны так:
 *
 *   recognize(request: RecognizeTextRequest, callback: (err, res: Operation) => void): ClientUnaryCall
 *
 * Yandex SDK поверх этого добавляет промисификацию в рантайме (через `util.promisify`
 * или аналог внутри `session.client()`). Типы при этом не обновляются — они остаются
 * в виде callback-API, хотя реально методы возвращают Promise.
 *
 * ## Правило применения
 *
 * Этот файл нужен только для **unary-вызовов** (один запрос → один ответ).
 * Стримовые методы (`ClientReadableStream`) типизированы в SDK корректно — они
 * не промисифицируются и работают без дополнительных обёрток.
 *
 * ## Паттерн для нового сервиса
 *
 * Если добавляется новый Yandex-сервис с unary-вызовами:
 * 1. Найти нужный ServiceClient в `@yandex-cloud/nodejs-sdk/<service>`
 * 2. Определить тип `Async<ServiceName>Client` с промис-сигнатурами unary-методов
 * 3. Стримовые методы скопировать из оригинального интерфейса как есть
 * 4. При создании клиента: `session.client(ServiceClient) as unknown as Async<ServiceName>Client`
 * 5. Задокументировать здесь же
 */

import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { operation } from '@yandex-cloud/nodejs-sdk/operation';

/**
 * Промисифицированный клиент асинхронного OCR.
 *
 * Оригинал: `ocrService.TextRecognitionAsyncServiceClient`
 *
 * Unary-методы:
 * - `recognize` — запускает OCR, возвращает `Operation`
 *
 * Stream-методы (из оригинального интерфейса, типизированы корректно):
 * - `getRecognition` — стримит страницы после завершения операции
 *
 * Отдельно: `folderId` не описан в proto-контракте `RecognizeTextRequest`,
 * но принимается gRPC-сервисом через механизм неизвестных полей proto3.
 */
export type AsyncOcrClient = {
    recognize(
        request: ocrService.RecognizeTextRequest & { folderId?: string },
    ): Promise<operation.Operation>;
    getRecognition(
        request: ocrService.GetRecognitionRequest,
    ): AsyncIterable<ocrService.RecognizeTextResponse>;
};
