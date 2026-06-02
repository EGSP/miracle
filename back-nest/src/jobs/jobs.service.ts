import {
    ConflictException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cause, Effect, Fiber } from 'effect';
import type { JobRun, JobRunsQuery, Stored, WorkerFinalPrompt } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import { execute, getJob, type AnyJob, type Job, type JobStore } from './framework/index.js';
import { createPrismaJobStore } from './prisma-job-store.js';

/**
 * Единый сервис движка задач (объединяет прежние JobRuntimeService и JobRunsService).
 * `@Global` через {@link JobsModule}. Запускает durable-прогоны, трекает волокна, восстанавливает
 * незавершённые корни при старте, поддерживает рекурсивную отмену, а также читает/удаляет прогоны.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
    private readonly logger: AppLogger;
    private readonly store: JobStore;
    private readonly fibers = new Map<string, Fiber.RuntimeFiber<unknown, unknown>>();

    constructor(
        private readonly prisma: PrismaService,
        @Inject(AppLoggerService) loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(JobsService.name);
        this.store = createPrismaJobStore(prisma);
    }

    /** Запускает корневой прогон: создаёт запись (`parentId`/`key` = null) и форкает исполнение. */
    async start<Input>(job: Job<Input, unknown>, input: Input): Promise<JobRun> {
        const root = await this.store.create({ job: job.id, parentId: null, key: null, input });
        this.launch(job, root);
        return root;
    }

    private launch(job: AnyJob, root: JobRun): void {
        const runnable = execute(this.store, job, root).pipe(
            Effect.catchAllCause((cause) =>
                Effect.sync(() =>
                    this.logger.error(`прогон "${root.id}" (${root.job}) упал`, Cause.squash(cause)),
                ),
            ),
        ) as Effect.Effect<void, never, never>;

        const fiber = Effect.runFork(runnable);
        this.fibers.set(root.id, fiber);
        fiber.addObserver(() => this.fibers.delete(root.id));
    }

    /** Отменяет прогон и всё его поддерево: прерывает волокно корня и рекурсивно метит `cancelled`. */
    async cancel(id: string): Promise<void> {
        const fiber = this.fibers.get(id);
        if (fiber) {
            await Effect.runPromise(Fiber.interrupt(fiber));
        }
        await this.cancelSubtree(id);
    }

    private async cancelSubtree(id: string): Promise<void> {
        const node = await this.store.findById(id);
        if (!node) return;
        if (node.status === 'running' || node.status === 'queued') {
            await this.store.patch(id, { status: 'cancelled' });
        }
        for (const child of await this.store.childrenOf(id)) {
            await this.cancelSubtree(child.id);
        }
    }

    /** Восстанавливает незавершённые корни после рестарта: replay переиспользует завершённых детей. */
    async onApplicationBootstrap(): Promise<void> {
        const roots = await this.store.roots(['running', 'queued']);
        for (const root of roots) {
            const job = getJob(root.job);
            if (!job) {
                this.logger.warn(`Прогон "${root.id}": нет определения job "${root.job}" — пропущен`);
                continue;
            }
            this.logger.info(`Восстановление прогона "${root.id}" (${root.job})`);
            this.launch(job, root);
        }
    }

    // ── Чтение и управление ───────────────────────────────────────────────────

    async list(query: JobRunsQuery): Promise<Stored<JobRun>[]> {
        const rows = await this.prisma.jobRun.findMany({
            where: query.status ? { status: query.status } : undefined,
            orderBy: query.sort ? { createdAt: query.sort } : undefined,
        });
        return rows as unknown as Stored<JobRun>[];
    }

    async getPromptPreview(id: string): Promise<WorkerFinalPrompt> {
        const root = await this.store.findById(id);
        if (!root) {
            throw new NotFoundException('Прогон не найден');
        }
        const prompt = await this.findFinalPrompt(root);
        if (!prompt) {
            throw new NotFoundException('У прогона ещё нет сохранённого промпта');
        }
        return prompt;
    }

    /** Рекурсивно ищет сохранённый промпт (`memo.finalPrompt`) в поддереве прогона по `parentId`. */
    private async findFinalPrompt(node: JobRun): Promise<WorkerFinalPrompt | undefined> {
        const prompt = node.memo?.['finalPrompt'];
        if (prompt && typeof prompt === 'object') {
            return prompt as WorkerFinalPrompt;
        }
        for (const child of await this.store.childrenOf(node.id)) {
            const found = await this.findFinalPrompt(child);
            if (found) return found;
        }
        return undefined;
    }

    async delete(id: string): Promise<void> {
        const run = await this.store.findById(id);
        if (!run) {
            throw new NotFoundException('Прогон не найден');
        }
        if (run.status === 'running') {
            throw new ConflictException('Нельзя удалить активный прогон');
        }
        try {
            await this.prisma.jobRun.delete({ where: { id } });
        } catch {
            throw new InternalServerErrorException('Не удалось удалить прогон');
        }
    }
}
