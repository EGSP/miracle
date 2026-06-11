import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FileModel, JobRun } from '@miracle/types';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { PreparedEngine } from './extractor.port.js';
import { PREPARE_DOCUMENT_JOB_ID, prepareJobKey, routePreparedEngine } from './router.js';

type PreparedDocumentRow = Awaited<ReturnType<PrismaService['preparedDocument']['findFirst']>>;

export type EnqueuePrepareResult = {
    prepared: NonNullable<PreparedDocumentRow>;
    jobRun: JobRun;
};

/**
 * CRUD и оркестрация {@link PreparedDocument}: постановка корневых джоб подготовки.
 * Автоподготовка на upload — Фаза 4.
 */
@Injectable()
export class DocumentPrepareService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly files: FilesService,
        private readonly jobs: JobsService,
    ) {}

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
        data: {
            markdown: string;
            pages?: unknown;
            meta?: unknown;
        },
    ): Promise<void> {
        await this.prisma.preparedDocument.update({
            where: { id: preparedDocumentId },
            data: {
                status: 'succeeded',
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
     * Создаёт или обновляет запись подготовки и ставит корневую stub-джобу.
     * Re-prepare перезаписывает единственную актуальную запись на `fileId`.
     */
    async enqueuePrepare(fileId: string): Promise<EnqueuePrepareResult> {
        const file = await this.requireSupportedFile(fileId);
        const engine = routePreparedEngine(file)!;

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

        const key = prepareJobKey(fileId);
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
