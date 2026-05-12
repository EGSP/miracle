import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation_models-v1';
import { operationService } from '@yandex-cloud/nodejs-sdk/operation';
import type { ZodSchema } from 'zod';
import { yandex } from './yandex.js';
import type { AsyncLlmClient, AsyncOperationClient } from './yandex-sdk.types.js';
import type { LlmRequest, LlmPollResult } from './yandex-llm.types.js';
import { callVisionCompletion } from './yandex-vision-llm.js';
export type { VisionRequest, VisionMessage, VisionUserContent } from './yandex-vision-llm.js';

const MODEL_SUFFIX = 'yandexgpt-5-lite';

/** Удаляет markdown-обёртку ```json ... ``` если модель добавила её вопреки инструкциям. */
function stripMarkdownFences(raw: string): string {
    return raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, '').trim();
}

class YandexLlm {
    /**
     * Запускает асинхронную LLM-операцию и немедленно возвращает её ID.
     * Результат получается через `pollCompletion` / `pollCompletionJson`.
     */
    async submitCompletion(request: LlmRequest): Promise<string> {
        const { folderId } = yandex.getConfig();
        const session = yandex.getSession();
        const client = session.client(
            textGenerationService.TextGenerationAsyncServiceClient,
        ) as unknown as AsyncLlmClient;

        const op = await client.completion(
            textGenerationService.CompletionRequest.fromPartial({
                modelUri: `gpt://${folderId}/${MODEL_SUFFIX}`,
                completionOptions: {
                    stream: false,
                    temperature: request.temperature ?? 0.3,
                    maxTokens: request.maxTokens ?? 2000,
                },
                messages: request.messages,
                ...(request.jsonSchema
                    ? { jsonSchema: { schema: request.jsonSchema } }
                    : {}),
            }),
        );

        if (!op.id) {
            throw new Error('YandexGPT не вернул идентификатор операции');
        }

        return op.id;
    }

    /**
     * Синхронный вызов мультимодальной модели (текст + изображения).
     * Возвращает текст ответа напрямую — Responses API не требует polling.
     */
    async callVisionCompletion(request: Parameters<typeof callVisionCompletion>[0]): Promise<string> {
        return callVisionCompletion(request);
    }

    /**
     * Однократно проверяет статус операции без блокирующего polling.
     * Вызывать в каждом тике воркера — позволяет проверять `shouldStop` между попытками.
     */
    async pollCompletion(operationId: string): Promise<LlmPollResult<string>> {
        const session = yandex.getSession();
        const opClient = session.client(
            operationService.OperationServiceClient,
        ) as unknown as AsyncOperationClient;

        const op = await opClient.get({ operationId });

        if (!op.done) {
            return { done: false };
        }

        if (op.error) {
            throw new Error(
                `Операция LLM "${operationId}" завершилась с ошибкой: ${op.error.message}`,
            );
        }

        if (!op.response) {
            throw new Error(
                `Операция LLM "${operationId}" завершена, но не содержит ответа`,
            );
        }

        const response = textGenerationService.CompletionResponse.decode(op.response.value);
        const text = stripMarkdownFences(response.alternatives[0]?.message?.text ?? '');

        return { done: true, result: text };
    }

    /**
     * Однократно проверяет статус операции и при завершении разбирает JSON-ответ,
     * валидируя его через переданную Zod-схему.
     */
    async pollCompletionJson<T>(
        operationId: string,
        schema: ZodSchema<T>,
    ): Promise<LlmPollResult<T>> {
        const poll = await this.pollCompletion(operationId);

        if (!poll.done) {
            return { done: false };
        }

        const data = schema.parse(JSON.parse(poll.result));
        return { done: true, result: data };
    }
}

export const yandexLlm = new YandexLlm();
