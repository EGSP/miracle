import path from 'path';
import { mkdir } from 'fs/promises';
import type { FileModel, FilesQuery, FileWithMeta } from '@miracle/types';
import { JsonCollection, registerDb, type CreateEntityInput } from './db.js';
import { runFileEncodingFix } from './runners/file.run.js';
import fs from 'fs';

export function getUploadsDir(): string {
    return path.join(process.cwd(), 'data', 'uploads');
}

export function getStoredFileName(file: FileModel): string {
    return file.extension ? `${file.id}.${file.extension}` : file.id;
}

export function getFilePath(file: FileModel): string {
    return path.join(getUploadsDir(), getStoredFileName(file));
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

    getByAuthor: (authorId: string) => {
        return filesDb.ref().filter((file) => file.authorId === authorId);
    },

    getAll: () => {
        return filesDb.list();
    },

    getFiles: (query: FilesQuery): FileWithMeta[] => {
        const withAvailability = (file: FileModel) => {
            const filePath = getFilePath(file);
            return fs.existsSync(filePath);
        };

        return filesDb.ref().filter((file) => {
            if (query.id !== undefined && file.id !== query.id) {
                return false;
            }

            if (query.authorId !== undefined && file.authorId !== query.authorId) {
                return false;
            }

            if (query.available !== undefined) {
                const isAvailable = withAvailability(file);
                if (isAvailable !== query.available) {
                    return false;
                }
            }

            return true;
        }).map((file) => {
            if (!query.includeMeta) {
                return file;
            }

            return {
                ...file,
                meta: {
                    available: withAvailability(file),
                },
            };
        });
    },

    /**
     * Проверяет, действительно ли файл существует в файловой системе
     * @param id - ID файла
     * @returns true, если файл существует, false в противном случае
     */
    checkFileAvailability: async (id: string) => {
        const file = await filesDb.getById(id);
        if (!file) {
            return false;
        }

        const filePath = getFilePath(file);
        return fs.existsSync(filePath);
    },
};

await runFileEncodingFix(filesDb);
