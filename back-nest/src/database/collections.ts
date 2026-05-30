import type { FileContent, FileModel, JobRun, ProductType, Session, User, WorkerData } from '@miracle/types';
import { JsonCollection } from './json-collection.js';

/**
 * Внутренняя форма пользователя — то, что лежит в БД (с полем password).
 * Публичные эндпоинты должны возвращать пользователя без password
 * (см. users/users.service.ts → getPublicById).
 */
export type UserInternal = User & { password: string };

export async function createCollections(dbDir: string) {
    return {
        users: await JsonCollection.create<UserInternal>('users', dbDir),
        sessions: await JsonCollection.create<Session>('sessions', dbDir),
        productTypes: await JsonCollection.create<ProductType>('product-types', dbDir),
        workers: await JsonCollection.create<WorkerData>('workers', dbDir),
        files: await JsonCollection.create<FileModel>('files', dbDir),
        filesContent: await JsonCollection.create<FileContent>('file-content', dbDir),
        jobRuns: await JsonCollection.create<JobRun>('job-runs', dbDir),
    } as const;
}

export type Collections = Awaited<ReturnType<typeof createCollections>>;
