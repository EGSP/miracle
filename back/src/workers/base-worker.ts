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

    /**
     * После успешного `run()` (запись в workers со статусом success) — переносит
     * сохранённые в воркере данные в связанные сущности (заказ, file-content и т.д.).
     */
    abstract apply(): Promise<void>;

    /** Идентификатор строки в workers.db после `mount()`. */
    abstract getWorkerRecordId(): string | undefined;

    stop(): void {
        this.shouldStop = true;
    }

    /**
     * Извлекает читаемое сообщение из пойманной ошибки.
     *
     * `String(error)` возвращает `"[object Object]"` для объектов без кастомного
     * `toString` (в том числе gRPC-ошибки из `nice-grpc`). Порядок проверок:
     * 1. `Error`-инстанс → `.message`
     * 2. Строка → как есть
     * 3. Объект → `JSON.stringify` (сохраняет полную структуру ошибки)
     * 4. Всё остальное → `String()` как последний вариант
     */
    protected static extractErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
}
