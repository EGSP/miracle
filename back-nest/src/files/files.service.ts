import {
    BadRequestException,
    Injectable,
    PayloadTooLargeException,
    type OnApplicationBootstrap,
} from '@nestjs/common';
import { mkdir, stat, unlink } from 'fs/promises';
import fs, { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { Effect } from 'effect';
import type { FileModel, FileWithMeta, FilesQuery, Stored } from '@miracle/types';
import { tryLabeledPromise } from '../common/effect-errors.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { fixFileNameEncoding } from './file-name-encoding.js';
import { FILE_UPLOAD_CONFIG } from './file-upload.config.js';

// id опционален: если передан — используется как имя файла на диске; иначе Prisma генерирует uuid.
export type CreateFileInput = Omit<FileModel, 'id'> & { id?: string };

// Тип одного multipart-файла, как его отдаёт `req.file()` (@fastify/multipart).
export type MultipartFile = NonNullable<Awaited<ReturnType<FastifyRequest['file']>>>;

const ALLOWED_MIME_TYPES = FILE_UPLOAD_CONFIG.allowedMimeTypes as readonly string[];

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

    /**
     * Записывает загруженный multipart-файл на диск и возвращает данные для создания записи `File`.
     * В БД ничего не пишет — это позволяет вызывающему создать `File` в общей транзакции
     * (например, вместе с `OrderApplication`).
     */
    async writeUploadToDisk(data: MultipartFile, authorId: string): Promise<CreateFileInput> {
        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
            data.file.resume();
            throw new BadRequestException(`File type "${data.mimetype}" is not allowed`);
        }

        const originalName = fixFileNameEncoding(data.filename);
        const ext = path.extname(originalName);
        const extension = ext ? ext.slice(1) : '';
        const id = randomUUID();
        const targetPath = path.join(
            this.getUploadsDir(),
            extension ? `${id}.${extension}` : id,
        );

        await pipeline(data.file, createWriteStream(targetPath));

        if (data.file.truncated) {
            await unlink(targetPath);
            throw new PayloadTooLargeException(
                `File exceeds the ${FILE_UPLOAD_CONFIG.maxSizeBytes} byte limit`,
            );
        }

        const { size } = await stat(targetPath);

        // id передаётся явно, потому что используется как имя файла на диске.
        return { id, name: originalName, extension, bytes: size, pages: undefined, authorId };
    }

    /** Полная загрузка: запись на диск + создание записи `File`. */
    async saveUpload(data: MultipartFile, authorId: string): Promise<Stored<FileModel>> {
        const input = await this.writeUploadToDisk(data, authorId);
        return this.create(input);
    }

    async get(id: string): Promise<Stored<FileModel> | null> {
        const row = await this.prisma.file.findUnique({ where: { id } });
        return row as Stored<FileModel> | null;
    }

    readonly effects = {
        get: (id: string): Effect.Effect<Stored<FileModel> | null, Error> =>
            tryLabeledPromise(`загрузка файла "${id}"`, () => this.get(id)),
    };

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
