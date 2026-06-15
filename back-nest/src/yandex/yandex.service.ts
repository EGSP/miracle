import { Inject, Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Duration, Effect, Exit, RateLimiter, Scope } from 'effect';
import { AppConfigService } from '../config/app-config.service.js';
import { currentTokensUsage } from '../common/tokens-usage.js';
import { LLM_USAGE_SINK, NoopLlmUsageSink, type LlmUsageSink } from './llm-usage.sink.js';
import { YandexOpenAiTransport } from './yandex-openai.transport.js';
import { YandexSdkTransport } from './yandex-sdk.transport.js';
import {
    estimateInputTokens,
    hasImageInput,
    parseResponseId,
    tagResponseId,
    YANDEX_MODELS,
    YandexResponseError,
    type YandexCompletedResponse,
    type YandexCreateResponseRequest,
    type YandexError,
    type YandexResponsePollResult,
    type YandexTransport,
} from './yandex.types.js';

// Публичная поверхность сервиса: потребители продолжают импортировать всё из `yandex.service.js`.
export {
    YANDEX_MODELS,
    YandexInput,
    YandexConfigError,
    YandexTransportError,
    YandexResponseError,
} from './yandex.types.js';
export type {
    YandexConfig,
    YandexJsonSchemaFormat,
    YandexCreateResponseRequest,
    YandexCompletedResponse,
    YandexResponsePollResult,
    YandexError,
} from './yandex.types.js';

type Limit = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;

/** Интервал между опросами фоновой операции в {@link YandexService.poll}. */
const POLL_INTERVAL = Duration.seconds(3);

/** Дедлайн суммарного ожидания фоновой операции в {@link YandexService.poll}. */
const POLL_TIMEOUT = Duration.minutes(30);

/**
 * Effectful-клиент Yandex AI — единый transport boundary для фоновых запросов к LLM.
 *
 * Сервис сам выбирает транспорт по структуре запроса: запрос с картинками идёт в Responses API
 * (vision), всё остальное — в нативный SDK с честной фоновой тарификацией. Потребитель об этом не
 * думает: он работает с непрозрачным id и одинаковым {@link YandexCompletedResponse} в обоих случаях.
 *
 * id, который возвращает {@link createResponse}, помечен тегом транспорта (`sdk:` / `openai:`), чтобы
 * {@link poll} после рестарта продолжил опрос той же операции, а не отправил модель повторно.
 */
@Injectable()
export class YandexService implements OnModuleInit, OnModuleDestroy {
    private readonly openaiTransport: YandexOpenAiTransport;
    private readonly sdkTransport: YandexSdkTransport;

    private readonly limiterScope = Effect.runSync(Scope.make());
    private submitLimit: Limit = (effect) => effect;
    private pollLimit: Limit = (effect) => effect;

    /**
     * Глобальный лимит одновременных запросов к Yandex (поверх rate-лимитеров). Накрывает ВСЕ
     * вызовы транспорта (submit/retrieve) независимо от пути: Yandex отклоняет более ~10 параллельных
     * запросов.
     */
    private concurrencyLimit: Limit = (effect) => effect;

    /** Приёмник ledger расхода токенов. Best-effort: его ошибки не влияют на LLM-вызов. */
    private readonly usageSink: LlmUsageSink;

    constructor(
        private readonly appConfig: AppConfigService,
        @Optional() @Inject(LLM_USAGE_SINK) usageSink?: LlmUsageSink,
    ) {
        this.openaiTransport = new YandexOpenAiTransport(appConfig);
        this.sdkTransport = new YandexSdkTransport(appConfig);
        this.usageSink = usageSink ?? new NoopLlmUsageSink();
    }

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
     * Создаёт фоновый запрос и возвращает помеченный тегом транспорта id.
     *
     * Метод только отправляет работу в облако. Он НЕ ждёт результата модели: для durable jobs id
     * нужно сохранить в `Memo`/`ToolMemo` сразу после submit, чтобы при рестарте продолжить polling.
     *
     * Транспорт выбирается автоматически: запрос с картинками → Responses API (vision), иначе → SDK.
     *
     * Почему текст идёт через нативный Yandex Node.js SDK, а не через Responses API: Yandex по факту
     * игнорирует `background: true` в OpenAI-compatible Responses — операция выполняется фоново, но
     * тарифицируется по СИНХРОННОЙ ставке (подтверждено техподдержкой). Честную фоновую тарификацию
     * даёт только нативный `TextGenerationAsyncService` SDK, поэтому весь текстовый LLM роутится туда.
     * Картинки SDK не принимает, так что vision вынужденно остаётся на Responses API.
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
        const transport: YandexTransport = hasImageInput(request.input) ? this.openaiTransport : this.sdkTransport;
        return Effect.gen(function* () {
            const rawId = yield* self.submitLimit(self.concurrencyLimit(transport.submit(request)));
            const id = tagResponseId(transport.tag, rawId);

            // Фаза submit ledger: атрибуция (ambient-теги + явный override) и оценка отправленных
            // токенов. Best-effort — на исход createResponse не влияет.
            const ambient = yield* currentTokensUsage;
            yield* self.usageSink.onRequest({
                responseId: id,
                transport: transport.tag,
                model: request.model ?? YANDEX_MODELS.text,
                tags: { ...ambient, ...(request.tags ?? {}) },
                estimatedInputTokens: estimateInputTokens(request),
            });
            return id;
        });
    }

    /**
     * Однократно читает состояние фонового запроса по помеченному id.
     *
     * Возвращает `{ done: false, response }`, пока Yandex обрабатывает задачу;
     * `{ done: true, response, outputText }` при успехе; typed-ошибку при сбое транспорта или
     * terminal failure. Транспорт определяется по тегу в id.
     */
    retrieveResponse(id: string): Effect.Effect<YandexResponsePollResult, YandexError> {
        const self = this;
        const { tag, rawId } = parseResponseId(id);
        const transport: YandexTransport = tag === 'sdk' ? this.sdkTransport : this.openaiTransport;
        return this.pollLimit(this.concurrencyLimit(transport.retrieve(rawId))).pipe(
            // Фаза response ledger: доводим строку фактическим usage при завершении и помечаем failed
            // при terminal-ошибке модели. Best-effort, дедуп по responseId внутри sink.
            Effect.tap((result) =>
                result.done
                    ? self.usageSink.onResponse({
                          responseId: id,
                          status: 'completed',
                          inputTokens: result.response.usage?.input_tokens ?? null,
                          outputTokens: result.response.usage?.output_tokens ?? null,
                          totalTokens: result.response.usage?.total_tokens ?? null,
                      })
                    : Effect.void,
            ),
            Effect.tapErrorTag('YandexResponseError', (error) =>
                self.usageSink.onResponse({
                    responseId: id,
                    status: 'failed',
                    inputTokens: null,
                    outputTokens: null,
                    totalTokens: null,
                    error: error.message,
                }),
            ),
        );
    }

    /**
     * Повторяет {@link retrieveResponse}, пока запрос не завершится успешно — единый источник правды
     * для ожидания фоновой операции.
     *
     * id нужно сохранить в `Memo`/`ToolMemo` ДО вызова `poll`: тогда при рестарте job продолжит
     * ожидание существующего запроса. Дедлайн {@link POLL_TIMEOUT} ограничивает суммарное ожидание;
     * таймер намеренно НЕ персистится. Внутри — interruptible `Effect.sleep`, ожидание корректно
     * прерывается при отмене job.
     */
    poll(id: string): Effect.Effect<YandexCompletedResponse, YandexError> {
        const self = this;
        return Effect.gen(function* () {
            while (true) {
                const result = yield* self.retrieveResponse(id);
                if (result.done) return result;
                yield* Effect.sleep(POLL_INTERVAL);
            }
        }).pipe(
            Effect.timeoutFail({
                duration: POLL_TIMEOUT,
                onTimeout: () =>
                    new YandexResponseError({
                        responseId: id,
                        message: `Yandex Responses: превышено время ожидания запроса "${id}" (${Duration.toMinutes(
                            POLL_TIMEOUT,
                        )} мин)`,
                    }),
            }),
        );
    }
}
