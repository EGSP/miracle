import type { JobId, JobRun, JobStatus } from '@miracle/types';

/** Данные для создания новой записи прогона. */
export type CreateRunInput = {
    job: JobId;
    /** id непосредственного родителя; `null` для корневого прогона. */
    parentId: string | null;
    /** Ключ идемпотентности в пределах родителя; `null` для корня. */
    key: string | null;
    input: unknown;
};

/** Частичное обновление записи прогона (рантайм пишет только меняющиеся поля). */
export type JobRunPatch = Partial<Pick<JobRun, 'status' | 'output' | 'error' | 'progress' | 'memo'>>;

/**
 * Порт хранилища прогонов. Отделяет чистый Effect-рантайм фреймворка от конкретной БД:
 * Nest-слой реализует этот интерфейс через Prisma. Все строки плоские, дерево восстанавливается
 * запросами по `parentId`.
 */
export interface JobStore {
    create(data: CreateRunInput): Promise<JobRun>;
    findById(id: string): Promise<JobRun | null>;
    /** Поиск ребёнка по паре `(parentId, key)` — основа дедупликации запусков. */
    findChild(parentId: string, key: string): Promise<JobRun | null>;
    /** Прямые потомки узла (для рекурсивной отмены и сбора прогресса). */
    childrenOf(parentId: string): Promise<JobRun[]>;
    /** Корневые прогоны (`parentId = null`) с указанными статусами — для восстановления. */
    roots(statuses: JobStatus[]): Promise<JobRun[]>;
    patch(id: string, patch: JobRunPatch): Promise<void>;
}
