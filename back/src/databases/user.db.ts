import type { User } from '@miracle/types';
import { USER_ROLES } from '@miracle/types';
import { JsonCollection, registerDb } from './db.js';
import { PASSWORD } from '../middlewares/tokensTools.js';
import { resolveUserRole } from '../lib/user-role.util.js';

export const userDb = registerDb('users', await JsonCollection.create<UserInternal>('users'));

declare module './db.js' {
    interface DbRegistry {
        users: typeof userDb;
    }
}

type UserInternal = User & {
    password: string;
}


function toPublicUser(user: UserInternal): User {
    const { password: _password, ...publicUser } = user;
    return {
        ...publicUser,
        role: resolveUserRole(publicUser),
    };
}

export const userService = {
    create: async (user: UserInternal): Promise<User> => {
        if(!user.login)
            throw new Error('Login is required');

        if(await userService.getByLogin(user.login)) {
            throw new Error('User already exists');
        }
        if(!user.password)
            throw new Error('Password is required');

        const hashedPassword = await PASSWORD.hash(user.password);
        const created = await userDb.create({
            ...user,
            role: user.role ?? USER_ROLES.EMPLOYEE,
            password: hashedPassword,
        });

        return toPublicUser(created);
    },
    getAll: async (): Promise<User[]> => {
        return userDb.ref().map(toPublicUser);
    },
    get: async (id:string): Promise<User | undefined> => {
        const user = await userDb.getById(id);
        return user ? toPublicUser(user) : undefined;
    },
    getInternal: async (id:string): Promise<UserInternal | undefined> => {
        return userDb.getById(id);
    },
    getByLogin: async (login:string): Promise<User | undefined> => {
        const user = userDb.ref()
            .filter(item => item.login === login)[0];

        return user ? toPublicUser(user) : undefined;
    },
    verifyPassword: async (user: User, password: string): Promise<boolean> => {
        if(!user.id)
            throw new Error('User ID is required');

        const userInternal = await userService.getInternal(user.id);
        if(!userInternal)
            throw new Error('User not found');

        return await PASSWORD.verify(password, userInternal.password);
    }
}