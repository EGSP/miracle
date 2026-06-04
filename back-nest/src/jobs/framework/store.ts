import type { JobId, JobKey, JobRun, JobStatus } from '@miracle/types';

/** Данные для создания новой записи прогона. */
export type CreateRunInput = {
    job: JobId;
    /** id непосредственного родителя; `null` для корневого прогона. */
    parentId: string | null;
    /** Структурный ключ-массив (читаемая форма). */
    key: JobKey;
    /** Канонический хеш ключа — глобальная идентичность (уникальный индекс). */
    keyHash: string;
    input: unknown;
};

/** Частичное обновление записи прогона (рантайм пишет только меняющиеся поля). */
export type JobRunPatch = Partial<Pick<JobRun, 'status' | 'output' | 'error' | 'progress' | 'memo'>>;

/**
 * Порт хранилища прогонов. Отделяет чистый Effect-рантайм фреймворка от конкретной БД:
 * Nest-слой реализует этот интерфейс через Prisma. Все строки плоские, дерево восстанавливается
 * запросами по `parentId`. Идентичность прогона — `keyHash`.
 */
export interface JobStore {
    /**
     * Найти прогон по `keyHash` или атомарно создать новый — основа идемпотентного запуска.
     * Реализация обязана быть race-safe (напр. upsert по уникальному `keyHash`).
     */
    findOrCreate(data: CreateRunInput): Promise<JobRun>;
    findById(id: string): Promise<JobRun | null>;
    /** Поиск прогона по глобальной идентичности `keyHash`. */
    findByKeyHash(keyHash: string): Promise<JobRun | null>;
    /** Прямые потомки узла (для рекурсивной отмены и сбора прогресса). */
    childrenOf(parentId: string): Promise<JobRun[]>;
    /** Корневые прогоны (`parentId = null`) с указанными статусами — для восстановления. */
    roots(statuses: JobStatus[]): Promise<JobRun[]>;
    patch(id: string, patch: JobRunPatch): Promise<void>;
}
