import { Effect } from 'effect';
import OpenAI from 'openai';
import type {
    Response,
    ResponseCreateParamsNonStreaming,
    ResponseOutputItem,
} from 'openai/resources/responses/responses.js';
import type { AppConfigService } from '../config/app-config.service.js';
import {
    YandexConfigError,
    YandexResponseError,
    YandexTransportError,
    buildModelUri,
    readYandexConfig,
    stripMarkdownFences,
    type YandexConfig,
    type YandexCreateResponseRequest,
    type YandexError,
    type YandexResponsePollResult,
    type YandexTransport,
} from './yandex.types.js';

const extractOutputText = (output: ResponseOutputItem[] | undefined): string => {
    const texts: string[] = [];
    for (const item of output ?? []) {
        if (item.type === 'message') {
            for (const content of item.content) {
                if (content.type === 'output_text') {
                    texts.push(content.text);
                }
            }
        }
    }
    return texts.join('');
};

const collectOutputHints = (output: ResponseOutputItem[] | undefined): string[] => {
    const hints: string[] = [];
    for (const item of output ?? []) {
        if (item.type === 'message') {
            for (const part of item.content) {
                if (part.type === 'refusal') {
                    const refusal = part.refusal.trim();
                    if (refusal) {
                        hints.push(`Отказ модели: ${refusal}`);
                    }
                }
            }
        }
        const withError = item as ResponseOutputItem & { error?: string | null };
        if (typeof withError.error === 'string' && withError.error.trim()) {
            hints.push(`Ошибка элемента (${item.type}): ${withError.error.trim()}`);
        }
    }
    return hints;
};

const formatFailedResponse = (response: Response, responseId: string): string => {
    const status = response.status ?? 'unknown';
    const parts: string[] = [`Yandex Responses: запрос "${responseId}" завершился со статусом "${status}"`];
    if (response.error) {
        const err = response.error as unknown as Record<string, unknown>;
        const code = err['code'] ? `[${String(err['code'])}] ` : '';
        const message = typeof err['message'] === 'string' ? err['message'] : '';
        parts.push(`${code}${message}`);
        const { code: _code, message: _message, ...rest } = err;
        if (Object.keys(rest).length > 0) {
            parts.push(`details: ${JSON.stringify(rest)}`);
        }
    }
    if (response.incomplete_details?.reason) {
        parts.push(`Причина незавершения: ${response.incomplete_details.reason}`);
    }
    parts.push(...collectOutputHints(response.output));
    parts.push(`fullBody: ${JSON.stringify(response)}`);
    return parts.join(' — ');
};

/**
 * Транспорт через OpenAI-compatible Responses API Yandex (`responses.create` / `responses.retrieve`).
 *
 * Используется для vision-разметки: только этот путь принимает изображения. Yandex игнорирует
 * `background: true` (по факту тарифицируется синхронно), поэтому весь текстовый LLM идёт через SDK.
 */
export class YandexOpenAiTransport implements YandexTransport {
    readonly tag = 'openai' as const;

    private client?: OpenAI;

    constructor(private readonly appConfig: AppConfigService) {}

    submit(request: YandexCreateResponseRequest): Effect.Effect<string, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            const client = yield* self.openAi();
            const config = yield* readYandexConfig(self.appConfig);
            const response = yield* Effect.tryPromise({
                try: (signal) => client.responses.create(self.toCreateParams(config, request), { signal }),
                catch: (cause) => new YandexTransportError({ operation: 'create', cause }),
            });
            if (!response.id) {
                return yield* new YandexResponseError({
                    responseId: 'unknown',
                    message: 'Yandex Responses не вернул идентификатор фонового запроса',
                    response,
                });
            }
            return response.id;
        });
    }

    retrieve(rawId: string): Effect.Effect<YandexResponsePollResult, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            const client = yield* self.openAi();
            const response = yield* Effect.tryPromise({
                try: (signal) => client.responses.retrieve(rawId, { stream: false }, { signal }),
                catch: (cause) => new YandexTransportError({ operation: 'retrieve', cause }),
            });

            if (response.status === 'queued' || response.status === 'in_progress') {
                return { done: false, response } as const;
            }
            if (response.status === 'failed' || response.status === 'cancelled' || response.status === 'incomplete') {
                return yield* new YandexResponseError({
                    responseId: rawId,
                    message: formatFailedResponse(response, rawId),
                    response,
                });
            }

            const outputText = stripMarkdownFences(response.output_text || extractOutputText(response.output));
            if (!outputText) {
                return yield* new YandexResponseError({
                    responseId: rawId,
                    message: `Yandex Responses: ответ "${rawId}" не содержит текста`,
                    response,
                });
            }
            return { done: true, response, outputText } as const;
        });
    }

    private openAi(): Effect.Effect<OpenAI, YandexConfigError> {
        const self = this;
        return Effect.gen(function* () {
            if (!self.client) {
                const { apiKey, folderId } = yield* readYandexConfig(self.appConfig);
                self.client = new OpenAI({
                    apiKey,
                    baseURL: 'https://ai.api.cloud.yandex.net/v1',
                    project: folderId,
                });
            }
            return self.client;
        });
    }

    private toCreateParams(
        config: YandexConfig,
        request: YandexCreateResponseRequest,
    ): ResponseCreateParamsNonStreaming {
        return {
            model: buildModelUri(config.folderId, request.model),
            input: request.input,
            instructions: request.instructions,
            temperature: request.temperature ?? 0.3,
            max_output_tokens: request.maxOutputTokens,
            metadata: request.metadata,
            background: true,
            stream: false,
            ...(request.jsonSchema
                ? {
                      text: {
                          format: {
                              type: 'json_schema' as const,
                              name: request.jsonSchema.name,
                              schema: request.jsonSchema.schema,
                              description: request.jsonSchema.description,
                              strict: request.jsonSchema.strict,
                          },
                      },
                  }
                : {}),
        };
    }
}
