import type { Session } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';

export const sessionDb = registerDb('sessions', await JsonCollection.create<Session>('sessions'));

declare module './db.js' {
    interface DbRegistry {
        sessions: typeof sessionDb;
    }
}
