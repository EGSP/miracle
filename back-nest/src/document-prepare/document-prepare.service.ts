import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FileModel, JobRun } from '@miracle/types';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { PreparedResult } from './extractor.port.js';
import { PREPARE_DOCUMENT_JOB_ID, prepareJobKey, routePreparedEngine } from './router.js';

type PreparedDocumentRow = Awaited<ReturnType<PrismaService['preparedDocument']['findFirst']>>;

export type EnqueuePrepareResult = {
    prepared: NonNullable<PreparedDocumentRow>;
    jobRun: JobRun;
};

/**
 * CRUD и оркестрация {@link PreparedDocument}: постановка корневых джоб подготовки.
 */
@Injectable()
export class DocumentPrepareService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly files: FilesService,
        private readonly jobs: JobsService,
    ) {}

    /**
     * Процесс-локальные мьютексы постановки подготовки — по одному на `fileId`. Гарантируют 1:1
     * «файл → актуальный PreparedDocument» на уровне сервиса (без уникального индекса в БД), чтобы
     * конкурентные триггеры (хук `onFileSaved` + ручной POST, двойной upload) не создавали дубли.
     */
    private readonly enqueueLocks = new Map<string, Promise<unknown>>();

    /** Сериализует `fn` по ключу `fileId`: следующий вызов ждёт завершения предыдущего. */
    private withFileLock<T>(fileId: string, fn: () => Promise<T>): Promise<T> {
        const prev = this.enqueueLocks.get(fileId) ?? Promise.resolve();
        const result = prev.then(fn, fn);
        const tail = result.catch(() => undefined);
        this.enqueueLocks.set(fileId, tail);
        void tail.then(() => {
            if (this.enqueueLocks.get(fileId) === tail) {
                this.enqueueLocks.delete(fileId);
            }
        });
        return result;
    }

    async getLatestByFile(fileId: string): Promise<NonNullable<PreparedDocumentRow> | null> {
        const row = await this.prisma.preparedDocument.findFirst({
            where: { fileId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
        });
        return row;
    }

    async markRunning(preparedDocumentId: string, jobRunId: string): Promise<void> {
        await this.prisma.preparedDocument.update({
            where: { id: preparedDocumentId },
            data: {
                status: 'running',
                jobRunId,
                error: null,
            },
        });
    }

    async markSucceeded(
        preparedDocumentId: string,
        data: Pick<PreparedResult, 'markdown' | 'pages' | 'meta'>,
    ): Promise<void> {
        await this.prisma.preparedDocument.update({
            where: { id: preparedDocumentId },
            data: {
                status: 'succeed',
                markdown: data.markdown,
                pages: data.pages as object | undefined,
                meta: data.meta as object | undefined,
                error: null,
            },
        });
    }

    async markFailed(preparedDocumentId: string, error: string): Promise<void> {
        await this.prisma.preparedDocument.update({
            where: { id: preparedDocumentId },
            data: {
                status: 'failed',
                error,
            },
        });
    }

    /**
     * Создаёт или обновляет запись подготовки и ставит корневую job `prepare-document`.
     * На один `fileId` — одна актуальная {@link PreparedDocument}; key `['prepare-document', fileId]`.
     *
     * Re-prepare после `succeed`: удаляет старый root JobRun, сбрасывает запись и запускает заново.
     * При уже идущем прогоне (`running`/`queued` JobRun) — без сброса markdown/meta, возврат текущего состояния.
     * При `failed`/`cancelled` JobRun — сброс записи; `jobs.start` переиспользует ту же строку по key.
     */
    async enqueuePrepare(fileId: string): Promise<EnqueuePrepareResult> {
        return this.withFileLock(fileId, () => this.enqueuePrepareInternal(fileId));
    }

    private async enqueuePrepareInternal(fileId: string): Promise<EnqueuePrepareResult> {
        const file = await this.requireSupportedFile(fileId);
        const engine = routePreparedEngine(file)!;

        const key = prepareJobKey(fileId);
        const existingRun = await this.jobs.findByKey([...key]);

        if (existingRun?.status === 'running' || existingRun?.status === 'queued') {
            let prepared = await this.getLatestByFile(fileId);
            if (!prepared) {
                prepared = await this.prisma.preparedDocument.create({
                    data: {
                        fileId,
                        status: 'queued',
                        engine,
                        jobRunId: existingRun.id,
                    },
                });
            } else if (prepared.jobRunId !== existingRun.id) {
                prepared = await this.prisma.preparedDocument.update({
                    where: { id: prepared.id },
                    data: { jobRunId: existingRun.id },
                });
            }
            return { prepared, jobRun: existingRun };
        }

        if (existingRun?.status === 'succeed') {
            await this.jobs.deleteRunTree(existingRun.id);
        }

        const existing = await this.getLatestByFile(fileId);
        const prepared = existing
            ? await this.prisma.preparedDocument.update({
                  where: { id: existing.id },
                  data: {
                      status: 'queued',
                      engine,
                      markdown: null,
                      pages: Prisma.DbNull,
                      meta: Prisma.DbNull,
                      error: null,
                      jobRunId: null,
                  },
              })
            : await this.prisma.preparedDocument.create({
                  data: {
                      fileId,
                      status: 'queued',
                      engine,
                  },
              });

        const jobRun = await this.jobs.start(
            PREPARE_DOCUMENT_JOB_ID,
            { fileId, preparedDocumentId: prepared.id, engine },
            [...key],
        );

        if (prepared.jobRunId !== jobRun.id) {
            await this.prisma.preparedDocument.update({
                where: { id: prepared.id },
                data: { jobRunId: jobRun.id },
            });
        }

        return {
            prepared: { ...prepared, jobRunId: jobRun.id },
            jobRun,
        };
    }

    /** Проверяет, что файл существует и поддерживается роутером DPS. */
    private async requireSupportedFile(fileId: string): Promise<FileModel> {
        const row = await this.files.get(fileId);
        if (!row) {
            throw new NotFoundException('Файл не найден');
        }
        const file = row as FileModel;
        if (!routePreparedEngine(file)) {
            throw new BadRequestException(`Формат файла "${file.extension}" не поддерживается DPS`);
        }
        return file;
    }
}
