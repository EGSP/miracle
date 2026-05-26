import type { Session, User } from '@miracle/types';
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
    } as const;
}

export type Collections = Awaited<ReturnType<typeof createCollections>>;
