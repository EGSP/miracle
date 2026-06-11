import { Injectable, OnModuleInit } from '@nestjs/common';
import { Effect } from 'effect';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Singleton process-local лимитер параллельных HTTP-запросов к kreuzberg.
 * Использование в HTTP-адаптере — Фаза 2.
 */
@Injectable()
export class KreuzbergConcurrencyLimiter implements OnModuleInit {
    private semaphore!: Effect.Semaphore;

    constructor(private readonly config: AppConfigService) {}

    onModuleInit(): void {
        this.semaphore = Effect.runSync(Effect.makeSemaphore(this.config.dpsMaxConcurrency));
    }

    /** Оборачивает Effect в process-local лимит (один permit на вызов). */
    withPermit = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
        this.semaphore.withPermits(1)(effect);
}
