import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Duration, Effect, Exit, RateLimiter, Scope } from 'effect';
import { Session } from '@yandex-cloud/nodejs-sdk';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation_models-v1';
import { operationService } from '@yandex-cloud/nodejs-sdk/operation';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import OpenAI from 'openai';
import type { ZodSchema } from 'zod';
import type { Content } from '@miracle/types';
import { AppConfigService } from '../config/app-config.service.js';
import type { AsyncLlmClient, AsyncOcrClient, AsyncOperationClient } from './yandex-sdk.types.js';
import type { LlmPollResult, LlmRequest } from './yandex-llm.types.js';
import {
    pollVisionCompletion,
    submitVisionCompletion,
    type VisionRequest,
} from './yandex-vision.js';

const MODEL_SUFFIX = 'yandexgpt-5.1/latest';

/** Удаляет markdown-обёртку ```json ... ``` если модель добавила её вопреки инструкциям. */
function stripMarkdownFences(raw: string): string {
    return raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, '').trim();
}

type YandexConfig = { apiKey: string; folderId: string };

/**
 * `@Global` вендор-обёртка над Yandex Cloud SDK (порт back/src/lib/yandex/*).
 * Сессия/клиенты создаются лениво и переиспользуются. Конфиг — из `AppConfigService`;
 * при его отсутствии методы кидают понятную ошибку (приложение поднимается без Yandex-кредов).
 */
type Limit = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;

@Injectable()
export class YandexService implements OnModuleInit, OnModuleDestroy {
    private session?: Session;
    private openaiClient?: OpenAI;

    // Глобальные лимитеры частоты к Yandex (квоты async-режима генерации текста). Живут весь
    // жизненный цикл приложения в этом scope; одни на все вызовы, поэтому потолок держится
    // независимо от того, сколько джоб-веток одновременно обращаются к API.
    private readonly limiterScope = Effect.runSync(Scope.make());
    private submitLimit: Limit = (effect) => effect; // 10/сек + 5000/час (submit)
    private pollLimit: Limit = (effect) => effect; // 50/сек (poll)

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
    }

    async onModuleDestroy(): Promise<void> {
        await Effect.runPromise(Scope.close(this.limiterScope, Exit.void));
    }

    private config(): YandexConfig {
        const apiKey = this.appConfig.yandexApiKey;
        const folderId = this.appConfig.yandexFolderId;
        if (!apiKey || !folderId) {
            throw new Error(
                'Yandex Cloud не сконфигурирован: задайте YANDEX_CLOUD_API_KEY и YANDEX_CLOUD_FOLDER_ID',
            );
        }
        return { apiKey, folderId };
    }

    private getSession(): Session {
        if (!this.session) {
            // SDK шлёт `Authorization: Bearer <token>`; Yandex различает IAM-токен (t1.) и API-ключ (AQVN) по префиксу.
            this.session = new Session({ iamToken: this.config().apiKey });
        }
        return this.session;
    }

    private getOpenAI(): OpenAI {
        if (!this.openaiClient) {
            const { apiKey, folderId } = this.config();
            this.openaiClient = new OpenAI({
                apiKey,
                baseURL: 'https://ai.api.cloud.yandex.net/v1',
                project: folderId,
            });
        }
        return this.openaiClient;
    }

    // ── Текстовая LLM (YandexGPT) ──────────────────────────────────────────

    async submitCompletion(request: LlmRequest): Promise<string> {
        await Effect.runPromise(this.submitLimit(Effect.void)); // занять слот квоты submit (10/сек + 5000/час)
        const { folderId } = this.config();
        const client = this.getSession().client(
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
                ...(request.jsonSchema ? { jsonSchema: { schema: request.jsonSchema } } : {}),
            }),
        );

        if (!op.id) {
            throw new Error('YandexGPT не вернул идентификатор операции');
        }
        return op.id;
    }

    async pollCompletion(operationId: string): Promise<LlmPollResult<string>> {
        await Effect.runPromise(this.pollLimit(Effect.void)); // занять слот квоты poll (50/сек)
        const opClient = this.getSession().client(
            operationService.OperationServiceClient,
        ) as unknown as AsyncOperationClient;

        const op = await opClient.get({ operationId });
        if (!op.done) {
            return { done: false };
        }
        if (op.error) {
            throw new Error(`Операция LLM "${operationId}" завершилась с ошибкой: ${op.error.message}`);
        }
        if (!op.response) {
            throw new Error(`Операция LLM "${operationId}" завершена, но не содержит ответа`);
        }

        const response = textGenerationService.CompletionResponse.decode(op.response.value);
        const text = stripMarkdownFences(response.alternatives[0]?.message?.text ?? '');
        return { done: true, result: text };
    }

    async pollCompletionJson<T>(operationId: string, schema: ZodSchema<T>): Promise<LlmPollResult<T>> {
        const poll = await this.pollCompletion(operationId);
        if (!poll.done) {
            return { done: false };
        }
        const data = schema.parse(JSON.parse(poll.result));
        return { done: true, result: data };
    }

    // ── Мультимодальная LLM (Vision) ───────────────────────────────────────

    async submitVisionCompletion(request: VisionRequest): Promise<string> {
        return submitVisionCompletion(this.getOpenAI(), this.config().folderId, request);
    }

    async pollVisionCompletion(taskId: string): Promise<LlmPollResult<string>> {
        return pollVisionCompletion(this.getOpenAI(), taskId);
    }

    // ── Асинхронный OCR ────────────────────────────────────────────────────

    async ocrRecognize(mimeType: string, content: Buffer): Promise<string> {
        const { folderId } = this.config();
        const client = this.getSession().client(
            ocrService.TextRecognitionAsyncServiceClient,
        ) as unknown as AsyncOcrClient;

        const op = await client.recognize({
            mimeType,
            content,
            folderId,
            languageCodes: ['ru'],
            model: '',
        });
        if (!op.id) {
            throw new Error('Yandex OCR не вернул идентификатор операции');
        }
        return op.id;
    }

    /** Однократная проверка статуса OCR-операции; при завершении — читает страницы. */
    async ocrPoll(operationId: string): Promise<LlmPollResult<Content[]>> {
        const opClient = this.getSession().client(
            operationService.OperationServiceClient,
        ) as unknown as AsyncOperationClient;

        const op = await opClient.get({ operationId });
        if (!op.done) {
            return { done: false };
        }
        if (op.error) {
            throw new Error(`Операция OCR "${operationId}" завершилась с ошибкой: ${op.error.message}`);
        }

        const ocrClient = this.getSession().client(
            ocrService.TextRecognitionAsyncServiceClient,
        ) as unknown as AsyncOcrClient;

        const pages: Content[] = [];
        for await (const page of ocrClient.getRecognition({ operationId })) {
            pages.push({ page: page.page, text: page.textAnnotation?.fullText });
        }
        return { done: true, result: pages };
    }
}
