import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FileModel, JobRun, PreparedDocument, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { PreparedEngine, PreparedResult } from './extractor.port.js';
import { PREPARE_DOCUMENT_JOB_ID, prepareJobKey, routePreparedEngine } from './router.js';

/**
 * {@link PreparedDocument}: постановка подготовки в очередь и чтение состояния.
 *
 * Разделение ответственности: сервис лишь СТАВИТ в очередь (создаёт queued-строку и запускает
 * корневую джобу `prepare-document`), после чего ВСЕ переходы статуса (`running`/`succeed`/`failed`)
 * принадлежат самой джобе. `enqueuePrepare` — fire-and-forget: возвращает `JobRun` для трекинга,
 * актуальное состояние читается по `fileId` ({@link getLatestByFile}).
 */
@Injectable()
export class DocumentPrepareService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly files: FilesService,
        private readonly jobs: JobsService,
    ) {}

    /**
     * Процесс-локальные мьютексы постановки — по одному на `fileId`. Гарантируют 1:1 «файл →
     * актуальный PreparedDocument» на уровне сервиса (без уникального индекса в БД): конкурентные
     * триггеры (хук `onFileSaved` + ручной POST, двойной upload) сериализуются, дублей строки и
     * двойного запуска джобы не возникает.
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

    /** Актуальная (не удалённая) запись подготовки по файлу или `null`. */
    async getLatestByFile(fileId: string): Promise<Stored<PreparedDocument> | null> {
        const row = await this.prisma.preparedDocument.findFirst({
            where: { fileId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
        });
        return row as Stored<PreparedDocument> | null;
    }

    // ── Переходы статуса (вызываются джобой `prepare-document`, ключ — fileId) ──────────────

    async markRunning(fileId: string, jobRunId: string): Promise<void> {
        await this.prisma.preparedDocument.updateMany({
            where: { fileId, deletedAt: null },
            data: { status: 'running', jobRunId, error: null },
        });
    }

    async markSucceeded(
        fileId: string,
        data: Pick<PreparedResult, 'markdown' | 'pages' | 'meta'>,
    ): Promise<void> {
        await this.prisma.preparedDocument.updateMany({
            where: { fileId, deletedAt: null },
            data: {
                status: 'succeed',
                markdown: data.markdown,
                pages: data.pages as object | undefined,
                meta: data.meta as object | undefined,
                error: null,
            },
        });
    }

    async markFailed(fileId: string, error: string): Promise<void> {
        await this.prisma.preparedDocument.updateMany({
            where: { fileId, deletedAt: null },
            data: { status: 'failed', error },
        });
    }

    // ── Постановка в очередь ───────────────────────────────────────────────────────────────

    /**
     * Ставит подготовку файла в очередь и возвращает `JobRun` для трекинга. Идемпотентно по
     * `fileId`: пока прогон `running`/`queued` — возвращает его как есть. Завершённый прогон
     * (`succeed`/`failed`/…) при повторном вызове сносится — re-prepare всегда делает свежее
     * извлечение. Дальнейшие статусы `PreparedDocument` проставляет джоба.
     */
    async enqueuePrepare(fileId: string): Promise<JobRun> {
        return this.withFileLock(fileId, () => this.enqueueInternal(fileId));
    }

    private async enqueueInternal(fileId: string): Promise<JobRun> {
        const file = await this.requireSupportedFile(fileId);
        const engine = routePreparedEngine(file)!;
        const key = prepareJobKey(fileId);

        const existingRun = await this.jobs.findByKey([...key]);
        if (existingRun?.status === 'running' || existingRun?.status === 'queued') {
            return existingRun;
        }
        if (existingRun) {
            await this.jobs.deleteRunTree(existingRun.id);
        }

        await this.createQueued(fileId, engine);
        return this.jobs.start(PREPARE_DOCUMENT_JOB_ID, { fileId, engine }, [...key]);
    }

    /**
     * Создаёт свежую `queued`-строку подготовки файла, предварительно удалив прежнюю из БД.
     * Re-prepare не накапливает историю и не оставляет устаревших данных — всегда чистая строка.
     */
    private async createQueued(fileId: string, engine: PreparedEngine): Promise<void> {
        await this.prisma.preparedDocument.deleteMany({ where: { fileId } });
        await this.prisma.preparedDocument.create({ data: { fileId, status: 'queued', engine } });
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
