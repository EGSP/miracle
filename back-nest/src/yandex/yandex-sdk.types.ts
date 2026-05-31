/**
 * Типы промисифицированных клиентов Yandex Cloud SDK (порт из back/src/lib/yandex/yandex-sdk.types.ts).
 *
 * gRPC-методы в .d.ts описаны как callback-API, хотя в рантайме SDK промисифицирует unary-вызовы.
 * Здесь — промис-сигнатуры для нужных unary-методов; стримовые (`getRecognition`) — как в оригинале.
 */
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation_models-v1';
import { operation } from '@yandex-cloud/nodejs-sdk/operation';

export type AsyncLlmClient = {
    completion(request: textGenerationService.CompletionRequest): Promise<operation.Operation>;
};

export type AsyncOperationClient = {
    get(request: { operationId: string }): Promise<operation.Operation>;
};

export type AsyncOcrClient = {
    recognize(
        request: ocrService.RecognizeTextRequest & { folderId?: string },
    ): Promise<operation.Operation>;
    getRecognition(
        request: ocrService.GetRecognitionRequest,
    ): AsyncIterable<ocrService.RecognizeTextResponse>;
};
