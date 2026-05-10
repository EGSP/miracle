import fs from 'fs/promises';
import type { ServerHealthWorkerData, WorkerData } from '@miracle/types';
import { workersService } from '../databases/workers.db.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

type ServerHealthWorkerParams = {
    existingWorkerId?: string;
};

const POLL_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Воркер мониторинга диска.
 * Работает вечно: каждые 2 секунды обновляет статистику
 * свободного/занятого места на диске в своей записи в workers.db.
 */
export class ServerHealthWorker extends BaseWorker {
    readonly type = 'server-health-worker';

    private workerId?: string;

    constructor(params: ServerHealthWorkerParams = {}) {
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
            throw new Error('[ServerHealthWorker] Воркер не инициализирован: вызовите mount() перед run()');
        }

        logger.info('[ServerHealthWorker] Запущен мониторинг диска');

        while (!this.shouldStop) {
            try {
                const stats = await fs.statfs(process.cwd());

                const diskTotalBytes = stats.blocks * stats.bsize;
                const diskAvailableBytes = stats.bavail * stats.bsize;
                const diskUsedBytes = diskTotalBytes - (stats.bfree * stats.bsize);
                const diskUsedPercent = diskTotalBytes > 0
                    ? Math.round((diskUsedBytes / diskTotalBytes) * 100)
                    : 0;

                await workersService.update(this.workerId, {
                    diskTotalBytes,
                    diskUsedBytes,
                    diskAvailableBytes,
                    diskUsedPercent,
                } satisfies Partial<ServerHealthWorkerData>);
            } catch (error) {
                logger.warn(`[ServerHealthWorker] Не удалось получить статистику диска: ${error instanceof Error ? error.message : String(error)}`);
            }

            await sleep(POLL_INTERVAL_MS);
        }

        await workersService.update(this.workerId, { status: 'stopped' });
        logger.info('[ServerHealthWorker] Остановлен');
    }
}
