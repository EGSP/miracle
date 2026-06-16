import { Injectable } from '@nestjs/common';
import type { LlmUsageByJob, LlmUsageByOrder, LlmUsageRecord } from '@miracle/types';
import type { LlmUsageRecord as LlmUsageRow } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';

/** Сколько последних завершённых записей отдаём на дашборд по умолчанию (бары на каждую запись). */
const RECENT_LIMIT = 200;

/** Маппинг строки Prisma в общий контракт {@link LlmUsageRecord} (Date → ISO, Json → теги). */
const toRecord = (row: LlmUsageRow): LlmUsageRecord => ({
    id: row.id,
    responseId: row.responseId,
    transport: row.transport,
    model: row.model,
    status: row.status,
    tags: (row.tags as Record<string, string> | null) ?? {},
    estimatedInputTokens: row.estimatedInputTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
});

/** Чтение ledger расхода токенов для дашбордов аналитики. */
@Injectable()
export class LlmUsageAnalyticsService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Последние завершённые (`completed`) записи в хронологическом порядке: старые слева, новые
     * справа. Берём последние {@link RECENT_LIMIT} по `completedAt desc` и разворачиваем в asc —
     * так график не разрастается на всю историю, но показывает свежий хвост по времени.
     */
    async recentCompleted(): Promise<LlmUsageRecord[]> {
        const rows = await this.prisma.llmUsageRecord.findMany({
            where: { status: 'completed' },
            orderBy: { completedAt: 'desc' },
            take: RECENT_LIMIT,
        });
        return rows.reverse().map(toRecord);
    }

    /**
     * Суммарный расход по каждому заказу за всё время (агрегат по `tags->>'orderId'`, только
     * `completed`). `groupBy` Prisma не умеет по JSON-пути, поэтому считаем raw-SQL (`::int` —
     * чтобы суммы пришли числами, а не bigint). Имена заказов резолвим отдельным запросом.
     */
    async byOrder(): Promise<LlmUsageByOrder[]> {
        const aggregates = await this.prisma.$queryRaw<
            Array<{
                orderId: string;
                inputTokens: number;
                outputTokens: number;
                totalTokens: number;
                requests: number;
            }>
        >`
            SELECT tags->>'orderId' AS "orderId",
                   sum(coalesce("inputTokens", 0))::int AS "inputTokens",
                   sum(coalesce("outputTokens", 0))::int AS "outputTokens",
                   sum(coalesce("totalTokens", 0))::int AS "totalTokens",
                   count(*)::int AS "requests"
            FROM llm_usage_records
            WHERE status = 'completed' AND tags->>'orderId' IS NOT NULL
            GROUP BY tags->>'orderId'
            ORDER BY sum(coalesce("totalTokens", 0)) DESC
        `;

        if (aggregates.length === 0) return [];

        const orders = await this.prisma.order.findMany({
            where: { id: { in: aggregates.map((row) => row.orderId) } },
            select: { id: true, name: true },
        });
        const nameById = new Map(orders.map((order) => [order.id, order.name]));

        return aggregates.map((row) => ({
            orderId: row.orderId,
            orderName: nameById.get(row.orderId) ?? null,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            totalTokens: row.totalTokens,
            requests: row.requests,
        }));
    }

    /**
     * Суммарный расход по типам джоб внутри одного заказа: join ledger → `job_runs` по
     * `tags->>'jobRunId'`, группировка по `job_runs.job`. Записи без `orderId` или без связанного
     * прогона джобы не попадают в выборку.
     */
    async byJob(orderId: string): Promise<LlmUsageByJob[]> {
        const aggregates = await this.prisma.$queryRaw<
            Array<{
                jobId: string;
                inputTokens: number;
                outputTokens: number;
                totalTokens: number;
                requests: number;
            }>
        >`
            SELECT jr.job AS "jobId",
                   sum(coalesce(lur."inputTokens", 0))::int AS "inputTokens",
                   sum(coalesce(lur."outputTokens", 0))::int AS "outputTokens",
                   sum(coalesce(lur."totalTokens", 0))::int AS "totalTokens",
                   count(*)::int AS "requests"
            FROM llm_usage_records lur
            INNER JOIN job_runs jr ON jr.id = (lur.tags->>'jobRunId')
            WHERE lur.status = 'completed'
              AND lur.tags->>'orderId' = ${orderId}
            GROUP BY jr.job
            ORDER BY sum(coalesce(lur."totalTokens", 0)) DESC
        `;

        return aggregates;
    }
}
