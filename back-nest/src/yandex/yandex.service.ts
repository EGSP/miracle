import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Data, Duration, Effect, Exit, RateLimiter, Scope } from 'effect';
import OpenAI from 'openai';
import type {
    EasyInputMessage,
    Response,
    ResponseCreateParamsNonStreaming,
    ResponseInputContent,
    ResponseInputImage,
    ResponseInputText,
    ResponseOutputItem,
} from 'openai/resources/responses/responses.js';
import { formatUnknown } from '../common/effect-errors.js';
import { AppConfigService } from '../config/app-config.service.js';

export const YANDEX_MODELS = {
    text: 'yandexgpt-5.1/latest',
    vision: 'qwen3.6-35b-a3b/latest',
} as const;

type YandexConfig = { apiKey: string; folderId: string };
type Limit = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;

export type YandexJsonSchemaFormat = {
    readonly name: string;
    readonly schema: Record<string, unknown>;
    readonly description?: string;
    readonly strict?: boolean;
};

export type YandexCreateResponseRequest = {
    readonly model?: string;
    readonly instructions?: string;
    readonly input: ResponseCreateParamsNonStreaming['input'];
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
    readonly jsonSchema?: YandexJsonSchemaFormat;
    readonly metadata?: ResponseCreateParamsNonStreaming['metadata'];
};

export type YandexCompletedResponse = {
    readonly done: true;
    readonly response: Response;
    readonly outputText: string;
};

export type YandexResponsePollResult = { readonly done: false; readonly response: Response } | YandexCompletedResponse;

export class YandexConfigError extends Data.TaggedError('YandexConfigError')<{
    readonly message: string;
}> {}

export class YandexTransportError extends Data.TaggedError('YandexTransportError')<{
    readonly operation: 'create' | 'retrieve';
    readonly cause: unknown;
}> {
    override get message(): string {
        return `Yandex Responses ${this.operation}: ${formatUnknown(this.cause)}`;
    }
}

export class YandexResponseError extends Data.TaggedError('YandexResponseError')<{
    readonly responseId: string;
    readonly message: string;
    readonly response?: Response;
}> {}

export type YandexError = YandexConfigError | YandexTransportError | YandexResponseError;

export const YandexInput = {
    text: (text: string): ResponseInputText => ({ type: 'input_text', text }),
    imageDataUrl: (
        imageUrl: string,
        detail: ResponseInputImage['detail'] = 'auto',
    ): ResponseInputImage => ({
        type: 'input_image',
        image_url: imageUrl,
        detail,
    }),
    user: (content: ReadonlyArray<ResponseInputContent>): EasyInputMessage => ({
        role: 'user',
        content: [...content],
    }),
} as const;

const stripMarkdownFences = (raw: string): string => raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, '').trim();

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

/** Интервал между опросами фоновой операции в {@link YandexService.poll}. */
const POLL_INTERVAL = Duration.seconds(3);

/** Дедлайн суммарного ожидания фоновой операции в {@link YandexService.poll}. */
const POLL_TIMEOUT = Duration.minutes(30);

/**
 * Effectful-клиент Yandex AI через OpenAI-compatible Responses API.
 *
 * Сервис не делит запросы на text/vision/ocr: это единый transport boundary для фоновых
 * `responses.create` / `responses.retrieve`. Доменные сценарии, JSON parsing и memo живут выше
 * уровнем — в jobs или JobTool.
 */
@Injectable()
export class YandexService implements OnModuleInit, OnModuleDestroy {
    private openaiClient?: OpenAI;

    private readonly limiterScope = Effect.runSync(Scope.make());
    private submitLimit: Limit = (effect) => effect;
    private pollLimit: Limit = (effect) => effect;

    /**
     * Глобальный лимит одновременных запросов к Yandex (поверх rate-лимитеров). Накрывает ВСЕ
     * вызовы транспорта (create/retrieve) независимо от домена и функции: Yandex отклоняет более
     * ~10 параллельных запросов. Permit удерживается только на время самого HTTP-вызова, а не на
     * время ожидания rate-лимитера — поэтому семафор всегда самый внутренний wrapper.
     */
    private concurrencyLimit: Limit = (effect) => effect;

    constructor(private readonly appConfig: AppConfigService) {}

    async onModuleInit(): Promise<void> {
        const make = (limit: number, interval: Duration.DurationInput): Promise<RateLimiter.RateLimiter> =>
            Effect.runPromise(
                Scope.extend(RateLimiter.make({ limit, interval, algorithm: 'token-bucket' }), this.limiterScope),
            );

        const perSecond = await make(10, Duration.seconds(1));
        const perHour = await make(5000, Duration.hours(1));
        const pollPerSecond = await make(50, Duration.seconds(1));

        this.submitLimit = (effect) => perHour(perSecond(effect));
        this.pollLimit = pollPerSecond;

        const semaphore = Effect.runSync(Effect.makeSemaphore(this.appConfig.yandexMaxConcurrency));
        this.concurrencyLimit = (effect) => semaphore.withPermits(1)(effect);
    }

    async onModuleDestroy(): Promise<void> {
        await Effect.runPromise(Scope.close(this.limiterScope, Exit.void));
    }

    /**
     * Создаёт фоновый запрос в Yandex Responses API и возвращает его `responseId`.
     *
     * Метод только отправляет работу в облако. Он НЕ ждёт результата модели: это важно для durable
     * jobs, потому что `responseId` нужно сохранить в `Memo`/`ToolMemo` сразу после submit. Тогда
     * при рестарте job продолжит polling существующего запроса, а не отправит модель повторно.
     *
     * `jsonSchema` — удобная надстройка сервиса: вызывающий передаёт обычный JSON Schema, а сервис
     * сам встраивает её в `text.format` Responses API.
     *
     * @example
     * ```ts
     * const responseId = yield* yandex.createResponse({
     *   model: YANDEX_MODELS.text,
     *   instructions: systemPrompt,
     *   input: [YandexInput.user([YandexInput.text(userText)])],
     *   jsonSchema: { name: 'ExtractPositions', schema: PositionsJsonSchema },
     * });
     * yield* memo.set('responseId', responseId);
     * ```
     */
    createResponse(request: YandexCreateResponseRequest): Effect.Effect<string, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            const client = yield* self.openAi();
            const config = yield* self.config();
            const response = yield* self.submitLimit(
                self.concurrencyLimit(
                    Effect.tryPromise({
                        try: (signal) =>
                            client.responses.create(self.toCreateParams(config, request), {
                                signal,
                            }),
                        catch: (cause) => new YandexTransportError({ operation: 'create', cause }),
                    }),
                ),
            );
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

    /**
     * Однократно читает состояние фонового запроса.
     *
     * `retrieve` здесь означает "получить текущее состояние уже созданного response". Метод делает
     * ровно один HTTP-запрос и возвращает:
     * - `{ done: false, response }`, если Yandex ещё обрабатывает задачу;
     * - `{ done: true, response, outputText }`, если задача завершилась успешно;
     * - typed ошибку, если транспорт упал или Yandex вернул terminal failure.
     *
     * Этот метод нужен для jobs/job-tools с собственной durable-памятью: внешний код сам решает,
     * где хранить `responseId`, как часто повторять polling и какие части полного `response`
     * сохранить для диагностики/метрик (`usage`, `output`, `status`, и т.п.).
     *
     * @example
     * ```ts
     * const poll = yield* yandex.retrieveResponse(responseId);
     * if (!poll.done) {
     *   yield* Effect.sleep(Duration.seconds(3));
     *   // потом вызвать retrieveResponse ещё раз
     * }
     * yield* memo.set('yandexResponse', poll.response);
     * ```
     */
    retrieveResponse(responseId: string): Effect.Effect<YandexResponsePollResult, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            const client = yield* self.openAi();
            const response = yield* self.pollLimit(
                self.concurrencyLimit(
                    Effect.tryPromise({
                        try: (signal) => client.responses.retrieve(responseId, { stream: false }, { signal }),
                        catch: (cause) => new YandexTransportError({ operation: 'retrieve', cause }),
                    }),
                ),
            );

            if (response.status === 'queued' || response.status === 'in_progress') {
                return { done: false, response } as const;
            }
            if (response.status === 'failed' || response.status === 'cancelled' || response.status === 'incomplete') {
                return yield* new YandexResponseError({
                    responseId,
                    message: formatFailedResponse(response, responseId),
                    response,
                });
            }

            const outputText = stripMarkdownFences(response.output_text || extractOutputText(response.output));
            if (!outputText) {
                return yield* new YandexResponseError({
                    responseId,
                    message: `Yandex Responses: ответ "${responseId}" не содержит текста`,
                    response,
                });
            }
            return { done: true, response, outputText } as const;
        });
    }

    /**
     * Повторяет {@link retrieveResponse}, пока запрос не завершится успешно — единый источник
     * правды для ожидания фоновой операции Yandex.
     *
     * `responseId` нужно сохранить в `Memo`/`ToolMemo` ДО вызова `poll`: тогда при рестарте job
     * продолжит ожидание существующего запроса, а не отправит модель повторно.
     *
     * Дедлайн {@link POLL_TIMEOUT} ограничивает суммарное ожидание (фоновые операции бывают
     * долгими, но не бесконечными). Таймер намеренно НЕ персистится: при рестарте отсчёт
     * начинается заново — это допустимо, прод-сервер не перезапускается каждые несколько минут.
     * Внутри — interruptible `Effect.sleep`, поэтому ожидание корректно прерывается при отмене job.
     *
     * @example
     * ```ts
     * const completed = yield* yandex.poll(responseId);
     * console.log(completed.response.usage);
     * ```
     */
    poll(responseId: string): Effect.Effect<YandexCompletedResponse, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            while (true) {
                const result = yield* self.retrieveResponse(responseId);
                if (result.done) return result;
                yield* Effect.sleep(POLL_INTERVAL);
            }
        }).pipe(
            Effect.timeoutFail({
                duration: POLL_TIMEOUT,
                onTimeout: () =>
                    new YandexResponseError({
                        responseId,
                        message: `Yandex Responses: превышено время ожидания запроса "${responseId}" (${Duration.toMinutes(
                            POLL_TIMEOUT,
                        )} мин)`,
                    }),
            }),
        );
    }

    private config(): Effect.Effect<YandexConfig, YandexConfigError> {
        const apiKey = this.appConfig.yandexApiKey;
        const folderId = this.appConfig.yandexFolderId;
        if (!apiKey || !folderId) {
            return Effect.fail(
                new YandexConfigError({
                    message: 'Yandex Cloud не сконфигурирован: задайте YANDEX_CLOUD_API_KEY и YANDEX_CLOUD_FOLDER_ID',
                }),
            );
        }
        return Effect.succeed({ apiKey, folderId });
    }

    private openAi(): Effect.Effect<OpenAI, YandexConfigError> {
        const self = this;
        return Effect.gen(function* () {
            if (!self.openaiClient) {
                const { apiKey, folderId } = yield* self.config();
                self.openaiClient = new OpenAI({
                    apiKey,
                    baseURL: 'https://ai.api.cloud.yandex.net/v1',
                    project: folderId,
                });
            }
            return self.openaiClient;
        });
    }

    private modelUri(config: YandexConfig, model: string | undefined): string {
        const selected = model ?? YANDEX_MODELS.text;
        return selected.startsWith('gpt://') ? selected : `gpt://${config.folderId}/${selected}`;
    }

    private toCreateParams(
        config: YandexConfig,
        request: YandexCreateResponseRequest,
    ): ResponseCreateParamsNonStreaming {
        return {
            model: this.modelUri(config, request.model),
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
