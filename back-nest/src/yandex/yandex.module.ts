import { Global, Module } from '@nestjs/common';
import { LLM_USAGE_SINK } from './llm-usage.sink.js';
import { LlmUsageService } from './llm-usage.service.js';
import { YandexAuthService } from './yandex-auth.service.js';
import { YandexBillingService } from './yandex-billing.service.js';
import { YandexService } from './yandex.service.js';

@Global()
@Module({
    providers: [
        YandexAuthService,
        YandexService,
        YandexBillingService,
        { provide: LLM_USAGE_SINK, useClass: LlmUsageService },
    ],
    exports: [YandexAuthService, YandexService, YandexBillingService],
})
export class YandexModule {}
