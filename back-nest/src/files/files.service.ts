import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import type { FileModel, FileWithMeta, FilesQuery, Stored } from '@miracle/types';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { fixFileNameEncoding } from './file-name-encoding.js';

// id опционален: если передан — используется как имя файла на диске; иначе Prisma генерирует uuid.
export type CreateFileInput = Omit<FileModel, 'id'> & { id?: string };

@Injectable()
export class FilesService implements OnApplicationBootstrap {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: AppConfigService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await mkdir(this.getUploadsDir(), { recursive: true });
        await this.runEncodingFix();
    }

    getUploadsDir(): string {
        return this.config.uploadsDir;
    }

    getStoredFileName(file: FileModel): string {
        return file.extension ? `${file.id}.${file.extension}` : file.id!;
    }

    getFilePath(file: FileModel): string {
        return path.join(this.getUploadsDir(), this.getStoredFileName(file));
    }

    async create(data: CreateFileInput): Promise<Stored<FileModel>> {
        const row = await this.prisma.file.create({ data });
        return row as Stored<FileModel>;
    }

    async get(id: string): Promise<Stored<FileModel> | null> {
        const row = await this.prisma.file.findUnique({ where: { id } });
        return row as Stored<FileModel> | null;
    }

    async getByAuthor(authorId: string): Promise<Stored<FileModel>[]> {
        const rows = await this.prisma.file.findMany({ where: { authorId } });
        return rows as Stored<FileModel>[];
    }

    async getAll(): Promise<Stored<FileModel>[]> {
        const rows = await this.prisma.file.findMany();
        return rows as Stored<FileModel>[];
    }

    async getFiles(query: FilesQuery): Promise<FileWithMeta[]> {
        const where: Record<string, unknown> = {};
        if (query.id !== undefined) where['id'] = query.id;
        if (query.authorId !== undefined) where['authorId'] = query.authorId;
        if (query.isTechnicalCondition !== undefined) {
            where['settings'] = { path: ['isTechnicalCondition'], equals: query.isTechnicalCondition };
        }

        const rows = await this.prisma.file.findMany({ where });

        const isAvailable = (file: Stored<FileModel>) => fs.existsSync(this.getFilePath(file));

        return (rows as Stored<FileModel>[])
            .filter((file) => {
                if (query.available !== undefined && isAvailable(file) !== query.available) {
                    return false;
                }
                return true;
            })
            .map((file) => {
                if (!query.includeMeta) return file;
                return { ...file, meta: { available: isAvailable(file) } };
            });
    }

    async patch(id: string, settings: FileModel['settings']): Promise<Stored<FileModel> | null> {
        const existing = await this.get(id);
        if (!existing) return null;
        const updated = await this.prisma.file.update({
            where: { id },
            data: { settings: settings ?? undefined },
        });
        return updated as Stored<FileModel>;
    }

    async checkFileAvailability(id: string): Promise<boolean> {
        const file = await this.get(id);
        if (!file) return false;
        return fs.existsSync(this.getFilePath(file));
    }

    private async runEncodingFix(): Promise<number> {
        const files = await this.prisma.file.findMany();
        let updatedCount = 0;
        for (const file of files) {
            const fixedName = fixFileNameEncoding(file.name);
            if (fixedName !== file.name) {
                await this.prisma.file.update({ where: { id: file.id }, data: { name: fixedName } });
                updatedCount += 1;
            }
        }
        return updatedCount;
    }
}
