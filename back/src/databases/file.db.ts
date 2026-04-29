import path from 'path';
import { mkdir } from 'fs/promises';
import type { FileModel } from '@miracle/types';
import { JsonCollection, registerDb, type CreateEntityInput } from './db.js';

export function getUploadsDir(): string {
    return path.join(process.cwd(), 'data', 'uploads');
}

export const filesDb = registerDb('files', await JsonCollection.create<FileModel>('files'));

await mkdir(getUploadsDir(), { recursive: true });

declare module './db.js' {
    interface DbRegistry {
        files: typeof filesDb;
    }
}

export const filesService = {
    create: async (data: CreateEntityInput<FileModel>) => {
        return filesDb.create(data);
    },

    getById: async (id: string) => {
        return filesDb.getById(id);
    },

    getByAuthor: async (authorId: string) => {
        return filesDb.ref().filter((file) => file.authorId === authorId);
    },
};
