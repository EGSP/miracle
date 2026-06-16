import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { LlmUsageAnalyticsService } from './llm-usage-analytics.service.js';

@Module({
    imports: [AuthModule],
    controllers: [AnalyticsController],
    providers: [LlmUsageAnalyticsService],
})
export class AnalyticsModule {}
