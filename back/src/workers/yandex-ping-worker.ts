import type { WorkerData, YandexPingWorkerData } from '@miracle/types';
import { workersService } from '../databases/workers.db.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

type YandexPingWorkerParams = {
    existingWorkerId?: string;
};

const PING_INTERVAL_MS = 5_000;
const PING_TIMEOUT_MS = 10_000;
const PING_URL = 'https://yandex.ru';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Воркер мониторинга доступности Яндекса.
 * Работает вечно: каждые 5 секунд пингует yandex.ru и сохраняет задержку
 * в своей записи в workers.db.
 */
export class YandexPingWorker extends BaseWorker {
    readonly type = 'yandex-ping-worker';

    private workerId?: string;

    constructor(params: YandexPingWorkerParams = {}) {
        super();
        this.workerId = params.existingWorkerId;
    }

    async mount(): Promise<void> {
        if (this.workerId) {
            // Восстановление после рестарта — повторно активируем запись
            await workersService.update(this.workerId, { status: 'active' });
        } else {
            const record = await workersService.create({
                type: this.type,
                status: 'active',
            } satisfies WorkerData);
            this.workerId = record.id;
        }
    }

    async run(): Promise<void> {
        if (!this.workerId) {
            throw new Error('[YandexPingWorker] Воркер не инициализирован: вызовите mount() перед run()');
        }

        logger.info('[YandexPingWorker] Запущен мониторинг доступности Яндекса');

        while (!this.shouldStop) {
            const latencyMs = await this.ping();

            await workersService.update(this.workerId, {
                latencyMs,
                lastPingedAt: Date.now(),
            } satisfies Partial<YandexPingWorkerData>);

            await sleep(PING_INTERVAL_MS);
        }

        await workersService.update(this.workerId, { status: 'stopped' });
        logger.info('[YandexPingWorker] Остановлен');
    }

    /**
     * Отправляет HEAD-запрос к Яндексу и возвращает задержку в мс.
     * Возвращает null при ошибке или таймауте.
     */
    private async ping(): Promise<number | null> {
        const start = Date.now();
        try {
            await fetch(PING_URL, {
                method: 'HEAD',
                signal: AbortSignal.timeout(PING_TIMEOUT_MS),
            });
            return Date.now() - start;
        } catch {
            logger.warn(`[YandexPingWorker] Пинг ${PING_URL} не удался`);
            return null;
        }
    }
}
