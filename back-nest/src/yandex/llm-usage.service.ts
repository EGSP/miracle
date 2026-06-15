import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { formatUnknown } from '../common/effect-errors.js';
import type { LlmUsageRequestEvent, LlmUsageResponseEvent, LlmUsageSink } from './llm-usage.sink.js';

/**
 * Prisma-реализация {@link LlmUsageSink}: пишет ledger расхода токенов в `llm_usage_records`.
 *
 * Двухфазно по `responseId` (уникальный, дедуп):
 * - {@link onRequest} — upsert строки в статусе `submitted` (атрибуция + оценка отправленных токенов);
 * - {@link onResponse} — update той же строки фактическим usage / terminal failure.
 *
 * Всё best-effort: ошибка записи ledger не должна ронять LLM-вызов — гасим и логируем. Поэтому при
 * рестарте после завершения повторный `onResponse` идемпотентен (update по тому же `responseId`).
 */
@Injectable()
export class LlmUsageService implements LlmUsageSink {
    constructor(private readonly prisma: PrismaService) {}

    onRequest(event: LlmUsageRequestEvent): Effect.Effect<void> {
        return this.bestEffort(`onRequest ${event.responseId}`, () =>
            this.prisma.llmUsageRecord.upsert({
                where: { responseId: event.responseId },
                create: {
                    responseId: event.responseId,
                    transport: event.transport,
                    model: event.model,
                    status: 'submitted',
                    tags: event.tags as Prisma.InputJsonValue,
                    estimatedInputTokens: event.estimatedInputTokens,
                },
                update: {
                    transport: event.transport,
                    model: event.model,
                    tags: event.tags as Prisma.InputJsonValue,
                    estimatedInputTokens: event.estimatedInputTokens,
                },
            }),
        );
    }

    onResponse(event: LlmUsageResponseEvent): Effect.Effect<void> {
        return this.bestEffort(`onResponse ${event.responseId}`, () =>
            // update (а не upsert): если submit-строки нет (редко — submit-запись упала), просто
            // пропускаем — терять основной поток ради ledger нельзя. P2025 поглощается bestEffort.
            this.prisma.llmUsageRecord.update({
                where: { responseId: event.responseId },
                data: {
                    status: event.status,
                    inputTokens: event.inputTokens,
                    outputTokens: event.outputTokens,
                    totalTokens: event.totalTokens,
                    error: event.error,
                    completedAt: new Date(),
                },
            }),
        );
    }

    /** Оборачивает запись в БД: гасит и логирует любую ошибку, всегда возвращая `Effect<void>`. */
    private bestEffort(context: string, write: () => Promise<unknown>): Effect.Effect<void> {
        return Effect.tryPromise(write).pipe(
            Effect.catchAll((cause) => Effect.logWarning(`LLM usage ledger ${context} не записан: ${formatUnknown(cause)}`)),
            Effect.asVoid,
        );
    }
}
