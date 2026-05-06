import type { WorkerType } from '@miracle/types';

export abstract class BaseWorker {
    abstract readonly type: WorkerType;

    protected shouldStop = false;

    /**
     * Подготовительный этап перед запуском run().
     * Вызывается пулом ровно один раз при старте воркера (в том числе при restore).
     * Здесь воркер может создать/восстановить свои записи и подготовить состояние.
     */
    abstract mount(): Promise<void>;

    abstract run(): Promise<void>;

    stop(): void {
        this.shouldStop = true;
    }
}
