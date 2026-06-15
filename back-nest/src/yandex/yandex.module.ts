import { Global, Module } from '@nestjs/common';
import { LLM_USAGE_SINK } from './llm-usage.sink.js';
import { LlmUsageService } from './llm-usage.service.js';
import { YandexService } from './yandex.service.js';

@Global()
@Module({
    providers: [YandexService, { provide: LLM_USAGE_SINK, useClass: LlmUsageService }],
    exports: [YandexService],
})
export class YandexModule {}
