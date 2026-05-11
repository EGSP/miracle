import { randomUUID } from 'crypto';
import { WorkerStatus } from '@miracle/types';
import type { Stored, WorkerData } from '@miracle/types';
import { workersService } from '../databases/workers.db.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';
import { ServerHealthWorker } from './server-health-worker.js';
import { YandexOcrWorker } from './yandex-ocr-worker.js';
import { YandexPingWorker } from './yandex-ping-worker.js';

export class WorkerPool {
    /** Карта запущенных воркеров: ключ только для памяти процесса. */
    private readonly active = new Map<string, BaseWorker>();

    async restore(): Promise<void> {
        const activeRecords = workersService.query((worker) => worker.status === WorkerStatus.Active);

        for (const record of activeRecords) {
            const worker = await this.createWorkerFromRecord(record);
            if (!worker) {
                continue;
            }

            this.launch(worker);
        }
    }

    launch(worker: BaseWorker): void {
        const newWorkerId = randomUUID();
        this.active.set(newWorkerId, worker);

        void worker.mount()
            .then(() => worker.run())
            .catch((error) => {
                logger.error(`[WorkerPool] Воркер "${worker.type}" завершился с ошибкой: ${error instanceof Error ? error.message : String(error)}`);
            })
            .finally(() => {
                this.active.delete(newWorkerId);
            });
    }

    find<T extends BaseWorker>(type: T['type'], predicate?: (worker: T) => boolean): T[] {
        const workers = Array.from(this.active.values()).filter((worker) => worker.type === type) as T[];
        return predicate ? workers.filter(predicate) : workers;
    }

    private async createWorkerFromRecord(record: Stored<WorkerData>): Promise<BaseWorker | null> {
        switch (record.type) {
            case 'yandex-ocr-worker': {
                return new YandexOcrWorker({
                    fileContentId: record.fileContentId,
                    fileId: record.fileId,
                    mimeType: record.mimeType,
                    existingCloudOperationId: record.cloudOperationId,
                    existingWorkerId: record.id,
                });
            }
            case 'server-health-worker': {
                return new ServerHealthWorker({ existingWorkerId: record.id });
            }
            case 'yandex-ping-worker': {
                return new YandexPingWorker({ existingWorkerId: record.id });
            }
            default:
                return null;
        }
    }
}

export const workerPool = new WorkerPool();
