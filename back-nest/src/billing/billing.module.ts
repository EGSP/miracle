import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingController } from './billing.controller.js';

/**
 * HTTP-слой биллинга. `YandexBillingService` живёт в глобальном {@link YandexModule}, поэтому
 * здесь импортируем только {@link AuthModule} ради `AuthGuard`.
 */
@Module({
    imports: [AuthModule],
    controllers: [BillingController],
})
export class BillingModule {}
