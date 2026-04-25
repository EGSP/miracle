import type { User } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';

export const userDb = registerDb('users', await JsonCollection.create<User>('users'));

declare module './db.js' {
    interface DbRegistry {
        users: typeof userDb;
    }
}
