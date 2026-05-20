import { randomUUID } from 'crypto';
import { WorkerStatus } from '@miracle/types';
import type {
    LlmVisionWorkerData,
    OrderDetailsWorkerData,
    Stored,
    TCDetailsWorkerData,
    WorkerData,
    YandexOcrWorkerData,
} from '@miracle/types';
import { workersService } from '../databases/workers.db.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';
import { LlmVisionWorker } from './scan/llm-vision-worker.js';
import { OrderDetailsWorker } from './order-details-worker.js';
import { TCDetailsWorker } from './tc-details.worker.js';
import { YandexOcrWorker } from './scan/yandex-ocr-worker.js';

export class WorkerPool {
    /** Карта запущенных воркеров: ключ только для памяти процесса. */
    private readonly active = new Map<string, BaseWorker>();

    async restore(): Promise<void> {
        const activeRecords = workersService.query((worker) => worker.status === WorkerStatus.Active);

        for (const record of activeRecords) {
            const worker = this.createWorkerFromRecord(record);
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
            .then(async () => {
                const wid = worker.getWorkerRecordId();
                if (!wid) return;
                const rec = workersService.get(wid);
                if (rec?.status !== WorkerStatus.Success) return;
                try {
                    await worker.apply();
                } catch (error) {
                    logger.error(
                        `[WorkerPool] apply для воркера "${wid}": ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            })
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

    private createWorkerFromRecord(record: Stored<WorkerData>): BaseWorker | null {
        switch (record.type) {
            case 'yandex-ocr-worker':
                return new YandexOcrWorker({ data: structuredClone(record) as Stored<YandexOcrWorkerData> });
            case 'order-details-worker':
                return new OrderDetailsWorker({ data: structuredClone(record) as Stored<OrderDetailsWorkerData> });
            case 'llm-vision-worker':
                return new LlmVisionWorker({ data: structuredClone(record) as Stored<LlmVisionWorkerData> });
            case 'tc-details-worker':
                return new TCDetailsWorker({ data: structuredClone(record) as Stored<TCDetailsWorkerData> });
            default:
                return null;
        }
    }

    /**
     * По id записи в workers: загрузка, проверка `success`, создание воркера, `apply()`.
     */
    async applyByWorkerId(workerId: string): Promise<void> {
        const record = workersService.get(workerId);
        if (!record) {
            throw new Error('Воркер не найден');
        }
        if (record.status !== WorkerStatus.Success) {
            throw new Error('Применение возможно только для воркера в статусе success');
        }
        for (const worker of this.active.values()) {
            /** 
             * Если воркер уже запущен, то не нужно создавать новый
             * и вызывать метод apply.
            */
            if (worker.getWorkerRecordId() === workerId) {
                return;
            }
        }
        const worker = this.createWorkerFromRecord(record);
        if (!worker) {
            throw new Error('Тип воркера не поддерживает применение результата');
        }
        
        await worker.apply();
    }
}

export const workerPool = new WorkerPool();
