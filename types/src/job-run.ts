/**
 * Модель durable-движка задач (см. лекции в .agents/lectures и .agents/plans/nest-migration/worker-rework).
 *
 * Единица работы — Job (описание, компилируемое в Effect). Запись об исполнении — единый рекурсивный
 * {@link JobRun}: лист хранит контрольную точку `memo`, составной Job — детей в `steps`.
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Брендированный идентификатор Job. Нельзя подставить произвольную строку — только значение,
 * полученное из `leaf(id, …)` / `named(id)` (которые брендируют через приведение).
 */
export type JobId = string & { readonly __job: unique symbol };

/** Прогресс шага (наблюдаемость, не состояние для возобновления). */
export type JobProgress = {
    phase: string;
    pct?: number;
};

/**
 * Запись об исполнении одного Job — рекурсивная.
 *
 * - ЛИСТ (реальная работа): есть `memo`/`output`, нет `steps`.
 * - СОСТАВНОЙ (sequence/parallel): есть `steps`+`cursor`, нет `memo`; его состояние — состояние детей.
 *
 * У корня добавляются поля `DbEntity` (id/createdAt/updatedAt) коллекцией; вложенные `steps` —
 * обычные объекты с собственным `id`.
 */
export type JobRun = {
    id: string;
    /** Идентификатор Job (ключ в реестре фабрик). */
    job: JobId;
    status: JobStatus;
    input?: unknown;
    /** Для `succeeded` — выход, подаётся во вход следующего шага. */
    output?: unknown;
    /** Для `failed` — сообщение об ошибке. */
    error?: string;
    progress?: JobProgress;
    /** ЛИСТ: контрольная точка возобновления, напр. `{ opId, finalPrompt }`. */
    memo?: Record<string, unknown>;
    /** СОСТАВНОЙ: индекс текущего дочернего шага. */
    cursor?: number;
    /** СОСТАВНОЙ: вложенные прогоны (рекурсия). */
    steps?: JobRun[];
};
