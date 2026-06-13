import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    type OnApplicationBootstrap,
} from '@nestjs/common';
import { Effect } from 'effect';
import type { FileModel, PreparedDocument, Stored } from '@miracle/types';
import { formatUnknown } from '../common/effect-errors.js';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import { DpsPipeline } from './dps-pipeline.service.js';
import type { PreparedEngine } from './extractor.port.js';
import { routePreparedEngine } from './router.js';

/**
 * {@link PreparedDocument}: постановка подготовки в очередь и чтение состояния.
 *
 * Разделение ответственности: сервис СТАВИТ запрос (создаёт queued-строку) и передаёт его движку
 * {@link DpsPipeline}; движок (линии обработки) ведёт переходы статуса (`running`/`succeed`/`failed`)
 * прямо в `PreparedDocument`. Джобы для kreuzberg/libre не используются — обработка идёт «в моменте»
 * через линии; durable-состояние целиком в `PreparedDocument`.
 */
@Injectable()
export class DocumentPrepareService implements OnApplicationBootstrap {
    private readonly logger: AppLogger;

    constructor(
        private readonly prisma: PrismaService,
        private readonly files: FilesService,
        private readonly pipeline: DpsPipeline,
        @Inject(AppLoggerService) loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(DocumentPrepareService.name);
    }

    /**
     * Процесс-локальные мьютексы постановки — по одному на `fileId`. Гарантируют 1:1 «файл →
     * актуальный PreparedDocument» на уровне сервиса (без уникального индекса в БД): конкурентные
     * триггеры (хук `onFileSaved` + ручной POST, двойной upload) сериализуются.
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

    /**
     * Реконсиляция при старте: линии эфемерны, поэтому незавершённые запросы (`queued`/`running`)
     * из durable-`PreparedDocument` повторно отправляем в движок. Идемпотентность — на уровне линий
     * (повторная обработка просто перезапишет результат).
     */
    async onApplicationBootstrap(): Promise<void> {
        const pending = await this.prisma.preparedDocument.findMany({
            where: { deletedAt: null, status: { in: ['queued', 'running'] } },
        });
        if (pending.length === 0) return;
        this.logger.info(`Реконсиляция DPS: повторная отправка ${pending.length} запросов`);
        for (const row of pending) {
            void Effect.runPromise(this.pipeline.submit(row.fileId)).catch((error) =>
                this.logger.error(`Реконсиляция: submit упал (fileId=${row.fileId})`, error, {
                    fileId: row.fileId,
                    detail: formatUnknown(error),
                }),
            );
        }
    }

    /** Актуальная (не удалённая) запись подготовки по файлу или `null`. */
    async getLatestByFile(fileId: string): Promise<Stored<PreparedDocument> | null> {
        const row = await this.prisma.preparedDocument.findFirst({
            where: { fileId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
        });
        return row as Stored<PreparedDocument> | null;
    }

    // ── Постановка в очередь ───────────────────────────────────────────────────────────────

    /**
     * Ставит подготовку файла в движок и возвращает актуальную `PreparedDocument`. Идемпотентно по
     * `fileId`: пока запись `running`/`queued` — возвращает её как есть (не пере-обрабатывает).
     * Завершённая (`succeed`/`failed`) при повторном вызове сносится — re-prepare всегда свежий.
     */
    async enqueuePrepare(fileId: string): Promise<Stored<PreparedDocument>> {
        return this.withFileLock(fileId, () => this.enqueueInternal(fileId));
    }

    private async enqueueInternal(fileId: string): Promise<Stored<PreparedDocument>> {
        const file = await this.requireSupportedFile(fileId);
        const engine = routePreparedEngine(file)!;

        const existing = await this.getLatestByFile(fileId);
        if (existing && (existing.status === 'running' || existing.status === 'queued')) {
            return existing;
        }

        await this.createQueued(fileId, engine);
        // submit помечает running и кладёт заказ в линию (offer может suspend-иться — backpressure).
        await Effect.runPromise(this.pipeline.submit(fileId));
        return (await this.getLatestByFile(fileId))!;
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
