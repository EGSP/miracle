import { Global, Module } from '@nestjs/common';
import { YandexService } from './yandex.service.js';

@Global()
@Module({
    providers: [YandexService],
    exports: [YandexService],
})
export class YandexModule {}
