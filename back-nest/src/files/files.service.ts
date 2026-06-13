import {
    BadRequestException,
    Inject,
    Injectable,
    PayloadTooLargeException,
    type OnApplicationBootstrap,
} from '@nestjs/common';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import fs, { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { Effect } from 'effect';
import type { FileModel, FileWithMeta, FilesQuery, Stored } from '@miracle/types';
import { formatUnknown, tryLabeledPromise } from '../common/effect-errors.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import { fixFileNameEncoding } from './file-name-encoding.js';
import { FileNotFoundError } from './files.errors.js';
import { FILE_UPLOAD_CONFIG } from './file-upload.config.js';

/** Колбэк после появления записи `File` (файл уже на диске). */
export type FileSavedHandler = (file: Stored<FileModel>) => void;

// id опционален: если передан — используется как имя файла на диске; иначе Prisma генерирует uuid.
export type CreateFileInput = Omit<FileModel, 'id'> & { id?: string };

/** Клиент БД с делегатом `file` — `PrismaService` или интерактивная транзакция. */
export type FileDbClient = Pick<PrismaService, 'file'>;

export type CreateFileOptions = {
    /**
     * Интерактивная транзакция. `onFileSaved` не вызывается внутри `create` —
     * после успешного `$transaction` вызови {@link notifyFileSaved}.
     */
    readonly tx?: FileDbClient;
};

// Тип одного multipart-файла, как его отдаёт `req.file()` (@fastify/multipart).
export type MultipartFile = NonNullable<Awaited<ReturnType<FastifyRequest['file']>>>;

const ALLOWED_MIME_TYPES = FILE_UPLOAD_CONFIG.allowedMimeTypes as readonly string[];

@Injectable()
export class FilesService implements OnApplicationBootstrap {
    private readonly logger: AppLogger;
    private readonly fileSavedHandlers = new Set<FileSavedHandler>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: AppConfigService,
        @Inject(AppLoggerService) loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(FilesService.name);
    }

    /**
     * Подписка на сохранение файла: запись `File` в БД, байты на диске.
     * Возвращает отписку. Доменные модули (например DPS) вешают обработчики сами.
     */
    onFileSaved(handler: FileSavedHandler): () => void {
        this.fileSavedHandlers.add(handler);
        return () => {
            this.fileSavedHandlers.delete(handler);
        };
    }

    /** Уведомляет подписчиков; ошибки обработчиков логируются, не пробрасываются. */
    notifyFileSaved(file: Stored<FileModel>): void {
        for (const handler of this.fileSavedHandlers) {
            try {
                handler(file);
            } catch (error) {
                this.logger.error(
                    `Обработчик onFileSaved упал (fileId=${file.id})`,
                    error,
                    { fileId: file.id, detail: formatUnknown(error) },
                );
            }
        }
    }

    async onApplicationBootstrap(): Promise<void> {
        await mkdir(this.getUploadsDir(), { recursive: true });
        await mkdir(this.getTempDir(), { recursive: true });
        await this.runEncodingFix();
        // Подметаем осиротевшие временные файлы (например, после краша во время обработки).
        await Effect.runPromise(this.sweepTemp());
    }

    getUploadsDir(): string {
        return this.config.uploadsDir;
    }

    /** Подкаталог для временных файлов обработки (например, .docx после конвертации .doc). */
    getTempDir(): string {
        return path.join(this.getUploadsDir(), 'temp');
    }

    // ── Временные файлы (uploads/temp) ───────────────────────────────────────────────────

    /** Пишет временный файл в `uploads/temp` и возвращает его путь. */
    writeTemp(bytes: Uint8Array, ext: string): Effect.Effect<string, Error> {
        return tryLabeledPromise('запись временного файла', async () => {
            const name = ext ? `${randomUUID()}.${ext}` : randomUUID();
            const target = path.join(this.getTempDir(), name);
            await writeFile(target, bytes);
            return target;
        });
    }

    /** Удаляет временный файл. Best-effort: ошибки логируются, наверх не пробрасываются. */
    removeTemp(filePath: string): Effect.Effect<void> {
        return Effect.promise(async () => {
            try {
                await unlink(filePath);
            } catch (error) {
                this.logger.warn(`Не удалось удалить временный файл ${filePath}`, {
                    detail: formatUnknown(error),
                });
            }
        });
    }

    /**
     * Даёт `use` путь к временному файлу и гарантированно удаляет его после (acquireRelease),
     * и при успехе, и при ошибке. Удобно, когда временный файл нужен в пределах одного Effect.
     */
    withTempFile<A, E, R>(
        bytes: Uint8Array,
        ext: string,
        use: (filePath: string) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | Error, R> {
        return Effect.acquireUseRelease(this.writeTemp(bytes, ext), use, (filePath) =>
            this.removeTemp(filePath),
        );
    }

    /** Чистит `uploads/temp` от всех файлов. Вызывается на старте (см. {@link onApplicationBootstrap}). */
    sweepTemp(): Effect.Effect<void> {
        return Effect.promise(async () => {
            try {
                const entries = await readdir(this.getTempDir());
                await Promise.all(
                    entries.map((name) =>
                        unlink(path.join(this.getTempDir(), name)).catch(() => undefined),
                    ),
                );
            } catch (error) {
                this.logger.warn('Не удалось подмести uploads/temp', {
                    detail: formatUnknown(error),
                });
            }
        });
    }

    getStoredFileName(file: FileModel): string {
        return file.extension ? `${file.id}.${file.extension}` : file.id;
    }

    getFilePath(file: FileModel): string {
        return path.join(this.getUploadsDir(), this.getStoredFileName(file));
    }

    /**
     * Создаёт запись `File` в БД (файл на диске уже должен существовать).
     * Без `tx` — сразу {@link notifyFileSaved}; с `tx` — notify после commit снаружи.
     */
    async create(data: CreateFileInput, options?: CreateFileOptions): Promise<Stored<FileModel>> {
        const db = options?.tx ?? this.prisma;
        const row = await db.file.create({ data });
        const file = row as Stored<FileModel>;
        if (!options?.tx) {
            this.notifyFileSaved(file);
        }
        return file;
    }

    /**
     * Записывает загруженный multipart-файл на диск и возвращает данные для {@link create}.
     * В БД ничего не пишет — для атомарности с другими сущностями передай `{ tx }` в `create`.
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
        /**
         * Как {@link FilesService.effects.get}, но падает {@link FileNotFoundError}, если файла нет.
         * Убирает повторяющийся `get → null-guard → fail("не найден")` в потребителях (tools, ридеры)
         * и даёт типизированный тег для `catchTag`.
         */
        require: (id: string): Effect.Effect<Stored<FileModel>, FileNotFoundError | Error> =>
            tryLabeledPromise(`загрузка файла "${id}"`, () => this.get(id)).pipe(
                Effect.flatMap((row) =>
                    row ? Effect.succeed(row) : Effect.fail(new FileNotFoundError({ id })),
                ),
            ),
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
