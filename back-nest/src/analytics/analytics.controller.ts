import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { LlmUsageByJob, LlmUsageByOrder, LlmUsageRecord } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { LlmUsageAnalyticsService } from './llm-usage-analytics.service.js';

/** Аналитика расхода токенов LLM (ledger `llm_usage_records`). */
@Controller('analytics/llm-usage')
@UseGuards(AuthGuard)
export class AnalyticsController {
    constructor(private readonly analytics: LlmUsageAnalyticsService) {}

    /** Последние завершённые записи расхода в хронологическом порядке (для дашборда статистики). */
    @Get('recent')
    recent(): Promise<LlmUsageRecord[]> {
        return this.analytics.recentCompleted();
    }

    /** Суммарный расход по каждому заказу за всё время (для карточек с pie-чартами). */
    @Get('by-order')
    byOrder(): Promise<LlmUsageByOrder[]> {
        return this.analytics.byOrder();
    }

    /** Суммарный расход по типам джоб внутри одного заказа (pie-чарт «какая джоба сколько съела»). */
    @Get('by-order/:orderId/by-job')
    byJob(@Param('orderId') orderId: string): Promise<LlmUsageByJob[]> {
        return this.analytics.byJob(orderId);
    }
}
