import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation_models-v1';
import { operationService } from '@yandex-cloud/nodejs-sdk/operation';
import { Effect } from 'effect';
import type { Response } from 'openai/resources/responses/responses.js';
import type { AppConfigService } from '../config/app-config.service.js';
import type { YandexAuthService } from './yandex-auth.service.js';
import type { AsyncLlmClient, AsyncOperationClient } from './yandex-sdk.types.js';
import {
    YandexConfigError,
    YandexResponseError,
    YandexTransportError,
    buildModelUri,
    hasImageInput,
    readYandexConfig,
    YANDEX_MODELS,
    type YandexCreateResponseRequest,
    type YandexError,
    type YandexResponsePollResult,
    type YandexTransport,
} from './yandex.types.js';

/** Дефолтный лимит токенов фоновой генерации, если запрос не задал свой. */
const SDK_DEFAULT_MAX_TOKENS = 2000;

type SdkRole = 'system' | 'user' | 'assistant';

/**
 * Конвертирует провайдеро-нейтральный запрос в `messages` SDK.
 *
 * На SDK-путь приходят только текстовые запросы (картинки роутятся в Responses API), поэтому из
 * content-частей берём лишь `input_text`. `instructions` становится system-сообщением.
 */
const toSdkMessages = (request: YandexCreateResponseRequest): { role: string; text: string }[] => {
    const messages: { role: string; text: string }[] = [];
    if (request.instructions) {
        messages.push({ role: 'system', text: request.instructions });
    }

    const { input } = request;
    if (typeof input === 'string') {
        messages.push({ role: 'user', text: input });
        return messages;
    }
    if (!input) return messages;

    for (const item of input) {
        const role = (item as { role?: unknown }).role;
        const sdkRole: SdkRole = role === 'assistant' || role === 'system' ? role : 'user';
        const content = (item as { content?: unknown }).content;

        if (typeof content === 'string') {
            messages.push({ role: sdkRole, text: content });
            continue;
        }
        if (Array.isArray(content)) {
            const text = content
                .filter((part) => part && typeof part === 'object' && (part as { type?: unknown }).type === 'input_text')
                .map((part) => String((part as { text?: unknown }).text ?? ''))
                .join('');
            if (text) {
                messages.push({ role: sdkRole, text });
            }
        }
    }
    return messages;
};

const toNumber = (value: number | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Собирает синтетический OpenAI `Response` из ответа SDK, чтобы потребитель видел единый shape
 * независимо от транспорта. Заполняем только поля, которые реально читают вызывающие
 * (`output_text`, `output`, `usage`, `status`, `model`); остальное минимально.
 */
const toSyntheticResponse = (
    operationId: string,
    decoded: textGenerationService.CompletionResponse,
    outputText: string,
): Response => {
    const usage = decoded.usage;
    return {
        id: operationId,
        object: 'response',
        status: 'completed',
        model: decoded.modelVersion || YANDEX_MODELS.text,
        created_at: Math.floor(Date.now() / 1000),
        output_text: outputText,
        output: [
            {
                id: operationId,
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: outputText, annotations: [] }],
            },
        ],
        usage: usage
            ? {
                  input_tokens: toNumber(usage.inputTextTokens) ?? 0,
                  output_tokens: toNumber(usage.completionTokens) ?? 0,
                  total_tokens: toNumber(usage.totalTokens) ?? 0,
              }
            : undefined,
    } as unknown as Response;
};

/** Минимальный синтетический Response для незавершённой операции (потребитель его не читает). */
const pendingResponse = (operationId: string): Response =>
    ({ id: operationId, object: 'response', status: 'in_progress' }) as unknown as Response;

/**
 * Транспорт через нативный Yandex Cloud SDK (`TextGenerationAsyncService`).
 *
 * Это ЧЕСТНАЯ фоновая операция Yandex: `completion` отдаёт `operationId`, статус опрашивается через
 * `OperationService.get`. В отличие от Responses API тарифицируется как асинхронная — этим путём идёт
 * весь текстовый LLM.
 */
export class YandexSdkTransport implements YandexTransport {
    readonly tag = 'sdk' as const;

    private llm?: AsyncLlmClient;
    private operations?: AsyncOperationClient;

    constructor(
        private readonly auth: YandexAuthService,
        private readonly appConfig: AppConfigService,
    ) {}

    submit(request: YandexCreateResponseRequest): Effect.Effect<string, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            // Защита транспорта: картинки умеет только Responses API. Сюда vision-запрос попасть не
            // должен (роутинг в YandexService отправляет его в OpenAI-транспорт), но если попал —
            // падаем явно, а не молча теряем изображения при конвертации в текстовые messages.
            if (hasImageInput(request.input)) {
                return yield* new YandexResponseError({
                    responseId: 'unknown',
                    message: 'Yandex Node.js SDK (TextGenerationAsyncService) не поддерживает картинки в запросе',
                });
            }

            const config = yield* readYandexConfig(self.appConfig);
            const client = yield* self.llmClient();

            const op = yield* Effect.tryPromise({
                try: () =>
                    client.completion(
                        textGenerationService.CompletionRequest.fromPartial({
                            modelUri: buildModelUri(config.folderId, request.model),
                            completionOptions: {
                                stream: false,
                                temperature: request.temperature ?? 0.3,
                                maxTokens: request.maxOutputTokens ?? SDK_DEFAULT_MAX_TOKENS,
                            },
                            messages: toSdkMessages(request),
                            ...(request.jsonSchema ? { jsonSchema: { schema: request.jsonSchema.schema } } : {}),
                        }),
                    ),
                catch: (cause) => new YandexTransportError({ operation: 'create', cause }),
            });

            if (!op.id) {
                return yield* new YandexResponseError({
                    responseId: 'unknown',
                    message: 'YandexGPT не вернул идентификатор фоновой операции',
                });
            }
            return op.id;
        });
    }

    retrieve(rawId: string): Effect.Effect<YandexResponsePollResult, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            const client = yield* self.operationClient();

            const op = yield* Effect.tryPromise({
                try: () => client.get({ operationId: rawId }),
                catch: (cause) => new YandexTransportError({ operation: 'retrieve', cause }),
            });

            if (!op.done) {
                return { done: false, response: pendingResponse(rawId) } as const;
            }
            if (op.error) {
                return yield* new YandexResponseError({
                    responseId: rawId,
                    message: `Операция LLM "${rawId}" завершилась с ошибкой: ${op.error.message}`,
                });
            }
            if (!op.response) {
                return yield* new YandexResponseError({
                    responseId: rawId,
                    message: `Операция LLM "${rawId}" завершена, но не содержит ответа`,
                });
            }

            const decoded = textGenerationService.CompletionResponse.decode(op.response.value);
            // Этот транспорт всегда передаёт JSON Schema, поэтому Yandex гарантирует структурный
            // ответ — markdown-обёртки ```json не бывает, берём текст как есть.
            const outputText = decoded.alternatives[0]?.message?.text ?? '';
            if (!outputText) {
                return yield* new YandexResponseError({
                    responseId: rawId,
                    message: `Операция LLM "${rawId}" завершена, но ответ не содержит текста`,
                });
            }
            return { done: true, response: toSyntheticResponse(rawId, decoded, outputText), outputText } as const;
        });
    }

    /** Ленивый клиент асинхронной генерации текста на общей IAM-сессии. */
    private llmClient(): Effect.Effect<AsyncLlmClient, YandexConfigError> {
        const self = this;
        return Effect.gen(function* () {
            if (!self.llm) {
                const session = yield* self.auth.getSession();
                self.llm = session.client(
                    textGenerationService.TextGenerationAsyncServiceClient,
                ) as unknown as AsyncLlmClient;
            }
            return self.llm;
        });
    }

    /** Ленивый клиент сервиса операций на общей IAM-сессии (опрос статуса фоновой генерации). */
    private operationClient(): Effect.Effect<AsyncOperationClient, YandexConfigError> {
        const self = this;
        return Effect.gen(function* () {
            if (!self.operations) {
                const session = yield* self.auth.getSession();
                self.operations = session.client(
                    operationService.OperationServiceClient,
                ) as unknown as AsyncOperationClient;
            }
            return self.operations;
        });
    }
}
