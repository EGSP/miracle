import type { WorkerData } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';
import type { CreateEntityInput, StoredEntity, UpdateEntityInput } from './db.js';
import { workerPool } from '../workers/worker-pool.js';

export const workersDb = registerDb('workers', await JsonCollection.create<WorkerData>('workers'));

declare module './db.js' {
    interface DbRegistry {
        workers: typeof workersDb;
    }
}

export const workersService = {
    create: async (data: CreateEntityInput<WorkerData>) => {
        return workersDb.create(data);
    },

    get: (id: string) => {
        return workersDb.getById(id);
    },

    update: async (id: string, patch: UpdateEntityInput<WorkerData>) => {
        return workersDb.update(id, patch);
    },

    query: (predicate: (worker: StoredEntity<WorkerData>) => boolean) => {
        return workersDb.ref().filter(predicate);
    },

    /**
     * Применяет сохранённые в записи воркера данные к связанным сущностям.
     * Создание экземпляра воркера и вызов `apply()` выполняет пул (`applyByWorkerId`).
     */
    applyWorkerData: async (id: string): Promise<void> => {
        await workerPool.applyByWorkerId(id);
    },
};
