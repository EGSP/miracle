import { Controller, Get, UseGuards } from '@nestjs/common';
import type { YandexBalance } from '@miracle/types';
import { Effect } from 'effect';
import { AuthGuard } from '../auth/auth.guard.js';
import { YandexBillingService } from '../yandex/yandex-billing.service.js';

/** Баланс биллинг-аккаунта Yandex Cloud (для шапки страниц статистики). */
@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
    constructor(private readonly billing: YandexBillingService) {}

    /** Текущий баланс. Значение кешируется на бэке (TTL 2 мин), к Yandex ходит не чаще TTL. */
    @Get('balance')
    balance(): Promise<YandexBalance> {
        return Effect.runPromise(this.billing.getBalance());
    }
}
