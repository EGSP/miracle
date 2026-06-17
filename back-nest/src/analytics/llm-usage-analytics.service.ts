import { Injectable } from '@nestjs/common';
import type { LlmUsageByJob, LlmUsageByModel, LlmUsageByOrder, LlmUsageRecord } from '@miracle/types';
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

type UsageAggregateRow = {
    orderId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requests: number;
};

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
     * Суммарный расход по каждому заказу за всё время вместе с разбивкой по джобам и моделям
     * (один ответ для карточек статистики — без дополнительных запросов на заказ).
     */
    async byOrder(): Promise<LlmUsageByOrder[]> {
        const aggregates = await this.prisma.$queryRaw<UsageAggregateRow[]>`
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

        const orderIds = aggregates.map((row) => row.orderId);

        const [orders, jobsByOrder, modelsByOrder] = await Promise.all([
            this.prisma.order.findMany({
                where: { id: { in: orderIds } },
                select: { id: true, name: true },
            }),
            this.prisma.$queryRaw<Array<LlmUsageByJob & { orderId: string }>>`
                SELECT lur.tags->>'orderId' AS "orderId",
                       jr.job AS "jobId",
                       sum(coalesce(lur."inputTokens", 0))::int AS "inputTokens",
                       sum(coalesce(lur."outputTokens", 0))::int AS "outputTokens",
                       sum(coalesce(lur."totalTokens", 0))::int AS "totalTokens",
                       count(*)::int AS "requests"
                FROM llm_usage_records lur
                INNER JOIN job_runs jr ON jr.id = (lur.tags->>'jobRunId')
                WHERE lur.status = 'completed'
                  AND lur.tags->>'orderId' = ANY(${orderIds})
                GROUP BY lur.tags->>'orderId', jr.job
                ORDER BY lur.tags->>'orderId', sum(coalesce(lur."totalTokens", 0)) DESC
            `,
            this.prisma.$queryRaw<Array<LlmUsageByModel & { orderId: string }>>`
                SELECT tags->>'orderId' AS "orderId",
                       model,
                       sum(coalesce("inputTokens", 0))::int AS "inputTokens",
                       sum(coalesce("outputTokens", 0))::int AS "outputTokens",
                       sum(coalesce("totalTokens", 0))::int AS "totalTokens",
                       count(*)::int AS "requests"
                FROM llm_usage_records
                WHERE status = 'completed'
                  AND tags->>'orderId' = ANY(${orderIds})
                GROUP BY tags->>'orderId', model
                ORDER BY tags->>'orderId', sum(coalesce("totalTokens", 0)) DESC
            `,
        ]);

        const nameById = new Map(orders.map((order) => [order.id, order.name]));
        const jobsMap = groupByOrderId(jobsByOrder, ({ orderId: _orderId, ...job }) => job);
        const modelsMap = groupByOrderId(modelsByOrder, ({ orderId: _orderId, ...model }) => model);

        return aggregates.map((row) => ({
            orderId: row.orderId,
            orderName: nameById.get(row.orderId) ?? null,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            totalTokens: row.totalTokens,
            requests: row.requests,
            byJob: jobsMap.get(row.orderId) ?? [],
            byModel: modelsMap.get(row.orderId) ?? [],
        }));
    }
}

function groupByOrderId<T extends { orderId: string }, U>(
    rows: T[],
    mapRow: (row: T) => U,
): Map<string, U[]> {
    const map = new Map<string, U[]>();
    for (const row of rows) {
        const list = map.get(row.orderId) ?? [];
        list.push(mapRow(row));
        map.set(row.orderId, list);
    }
    return map;
}
