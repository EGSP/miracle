import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import type { FileModel, FileWithMeta, FilesQuery, Stored } from '@miracle/types';
import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { CreateEntityInput } from '../database/json-collection.js';
import { fixFileNameEncoding } from './file-name-encoding.js';

@Injectable()
export class FilesService implements OnApplicationBootstrap {
    constructor(
        private readonly db: DatabaseService,
        private readonly config: AppConfigService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await mkdir(this.getUploadsDir(), { recursive: true });
        await this.runEncodingFix();
    }

    getUploadsDir(): string {
        return path.join(this.config.dataDir, 'uploads');
    }

    getStoredFileName(file: FileModel): string {
        return file.extension ? `${file.id}.${file.extension}` : file.id;
    }

    getFilePath(file: FileModel): string {
        return path.join(this.getUploadsDir(), this.getStoredFileName(file));
    }

    create(data: CreateEntityInput<FileModel>): Promise<Stored<FileModel>> {
        return this.db.collections.files.create(data);
    }

    get(id: string): Stored<FileModel> | undefined {
        return this.db.collections.files.getById(id);
    }

    getByAuthor(authorId: string): Stored<FileModel>[] {
        return this.db.collections.files.ref().filter((file) => file.authorId === authorId);
    }

    getAll(): Stored<FileModel>[] {
        return this.db.collections.files.list();
    }

    getFiles(query: FilesQuery): FileWithMeta[] {
        const isAvailable = (file: FileModel) => fs.existsSync(this.getFilePath(file));

        return this.db.collections.files
            .ref()
            .filter((file) => {
                if (query.id !== undefined && file.id !== query.id) {
                    return false;
                }
                if (query.authorId !== undefined && file.authorId !== query.authorId) {
                    return false;
                }
                if (query.available !== undefined && isAvailable(file) !== query.available) {
                    return false;
                }
                if (query.isTechnicalCondition !== undefined) {
                    const val = file.settings?.isTechnicalCondition ?? false;
                    if (val !== query.isTechnicalCondition) {
                        return false;
                    }
                }
                return true;
            })
            .map((file) => {
                if (!query.includeMeta) {
                    return file;
                }
                return { ...file, meta: { available: isAvailable(file) } };
            });
    }

    async patch(id: string, settings: FileModel['settings']): Promise<Stored<FileModel> | undefined> {
        const existing = this.db.collections.files.getById(id);
        if (!existing) {
            return undefined;
        }
        return this.db.collections.files.update(id, { settings });
    }

    /** Проверяет, действительно ли файл существует в файловой системе. */
    checkFileAvailability(id: string): boolean {
        const file = this.db.collections.files.getById(id);
        if (!file) {
            return false;
        }
        return fs.existsSync(this.getFilePath(file));
    }

    /** Чинит mojibake в именах файлов при старте (миграция со старого бэкенда). */
    private async runEncodingFix(): Promise<number> {
        const files = this.db.collections.files.list();
        let updatedCount = 0;

        for (const file of files) {
            const fixedName = fixFileNameEncoding(file.name);
            if (fixedName !== file.name) {
                await this.db.collections.files.update(file.id, { name: fixedName });
                updatedCount += 1;
            }
        }

        return updatedCount;
    }
}
