import { Effect } from 'effect';
import type { TransportTag } from './yandex.types.js';

/** Открытый набор измерений атрибуции расхода (orderId/userId/jobRunId/…). */
export type LlmUsageTags = Record<string, string>;

/** Событие отправки запроса: фиксируется ДО ответа, несёт атрибуцию и оценку отправленных токенов. */
export type LlmUsageRequestEvent = {
    readonly responseId: string;
    readonly transport: TransportTag;
    readonly model: string;
    readonly tags: LlmUsageTags;
    readonly estimatedInputTokens: number | null;
};

/** Событие завершения: фактический usage или terminal failure для уже созданной строки. */
export type LlmUsageResponseEvent = {
    readonly responseId: string;
    readonly status: 'completed' | 'failed';
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly totalTokens: number | null;
    readonly error?: string;
};

/**
 * Порт записи расхода токенов (dependency inversion): {@link YandexService} зависит от этого
 * абстрактного приёмника, а не от БД. Конкретную реализацию (Prisma-ledger) подключает yandex-модуль.
 *
 * Обе операции ОБЯЗАНЫ быть best-effort: учёт никогда не должен ронять основной LLM-вызов. Реализация
 * сама гасит свои ошибки; интерфейс возвращает `Effect<void>` без канала ошибок.
 */
export interface LlmUsageSink {
    /** Создаёт/обновляет строку расхода на отправке запроса (фаза submit). */
    onRequest(event: LlmUsageRequestEvent): Effect.Effect<void>;
    /** Доводит строку расхода фактическим usage при завершении (фаза response). */
    onResponse(event: LlmUsageResponseEvent): Effect.Effect<void>;
}

/** DI-токен порта {@link LlmUsageSink}. */
export const LLM_USAGE_SINK = Symbol('LLM_USAGE_SINK');

/** Заглушка: ничего не пишет. Используется, если ledger-реализация не подключена (тесты/standalone). */
export class NoopLlmUsageSink implements LlmUsageSink {
    onRequest(): Effect.Effect<void> {
        return Effect.void;
    }
    onResponse(): Effect.Effect<void> {
        return Effect.void;
    }
}
