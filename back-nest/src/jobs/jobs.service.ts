import {
    ConflictException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    type OnApplicationBootstrap,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Cause, Effect, Fiber } from 'effect';
import type { JobKey, JobRun, JobRunsQuery, Stored, WorkerFinalPrompt } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import {
    brandJobId,
    execute,
    getJob,
    hashKey,
    JOB_IMPL_METADATA,
    registerJob,
    type AnyJob,
    type Job,
    type JobStore,
} from './framework/index.js';
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
        private readonly discovery: DiscoveryService,
        private readonly reflector: Reflector,
        @Inject(AppLoggerService) loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(JobsService.name);
        this.store = createPrismaJobStore(prisma);
    }

    /**
     * Запускает корневой прогон. `key` — ключ идемпотентности (стиль TanStack); если передан и
     * прогон с таким `keyHash` уже есть: `succeed`/`running` → возвращаем существующий (не
     * дублируем), `queued`/`failed`/`cancelled` → (пере)запускаем ту же строку. Без `key` каждый
     * запуск уникален (`[job.id, uuid]`) — прежнее поведение «всегда новый корень».
     *
     * Принимает либо сам джоб, либо его строковый id (джоб берётся из реестра) — последнее
     * удобно потребителям из других модулей, которым нельзя инъецировать сам класс джоба.
     */
    async start<Input>(job: Job<Input, unknown>, input: Input, key?: JobKey): Promise<JobRun>;
    async start(jobId: string, input: unknown, key?: JobKey): Promise<JobRun>;
    async start(jobOrId: AnyJob | string, input: unknown, key?: JobKey): Promise<JobRun> {
        const job = typeof jobOrId === 'string' ? this.requireJob(jobOrId) : jobOrId;
        const finalKey: JobKey = key ?? [job.id, randomUUID()];
        const root = await this.store.findOrCreate({
            job: job.id,
            parentId: null,
            key: finalKey,
            keyHash: hashKey(finalKey),
            input,
        });
        // Идемпотентный ключ: уже выполнен или в процессе — повторно не запускаем.
        if (root.status === 'succeed' || root.status === 'running') {
            return root;
        }
        this.launch(job, root);
        return root;
    }

    /** Найти прогон по структурному ключу (через его `keyHash`). */
    async findByKey(key: JobKey): Promise<JobRun | null> {
        return this.store.findByKeyHash(hashKey(key));
    }

    /** Физически удалить прогон и всё его поддерево (для супрессии при переанализе). */
    async deleteRunTree(rootId: string): Promise<void> {
        await this.store.deleteSubtree(rootId);
    }

    private requireJob(id: string): AnyJob {
        const job = getJob(brandJobId(id));
        if (!job) {
            throw new NotFoundException(`Неизвестный джоб "${id}"`);
        }
        return job;
    }

    private launch(job: AnyJob, root: JobRun): void {
        const runnable = execute(this.store, job, root).pipe(
            Effect.catchAllCause((cause) =>
                Effect.sync(() =>
                    this.logger.error(`прогон "${root.id}" (${root.job}) упал`, Cause.pretty(cause)),
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

    /**
     * Авторегистрация всех джоб-провайдеров (помеченных {@link JobImpl}) в реестре через
     * `DiscoveryService` — заменяет прежние доменные регистраторы. Затем восстанавливает
     * незавершённые корни: replay переиспользует завершённых детей.
     */
    async onApplicationBootstrap(): Promise<void> {
        this.registerDiscoveredJobs();
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

    /** Находит провайдеры с маркером {@link JobImpl} и регистрирует их экземпляры в реестре. */
    private registerDiscoveredJobs(): void {
        const ids: string[] = [];
        for (const wrapper of this.discovery.getProviders()) {
            const { metatype, instance } = wrapper;
            if (!instance || typeof metatype !== 'function') continue;
            if (this.reflector.get<boolean>(JOB_IMPL_METADATA, metatype) !== true) continue;
            const job = instance as AnyJob;
            registerJob(job);
            ids.push(job.id);
        }
        this.logger.info(`Зарегистрировано джобов: ${ids.length}`, { jobs: ids });
    }

    // ── Чтение и управление ───────────────────────────────────────────────────

    async list(query: JobRunsQuery): Promise<Stored<JobRun>[]> {
        const rows = await this.prisma.jobRun.findMany({
            where: {
                ...(query.status ? { status: query.status } : {}),
                ...(query.onlyRoots ? { parentId: null } : {}),
            },
            orderBy: query.sort ? { createdAt: query.sort } : undefined,
        });
        return rows as unknown as Stored<JobRun>[];
    }

    /** Плоский список корня и всех потомков (BFS), для UI-дерева. */
    async getTree(rootId: string): Promise<Stored<JobRun>[]> {
        const root = await this.prisma.jobRun.findUnique({ where: { id: rootId } });
        if (!root) {
            throw new NotFoundException('Прогон не найден');
        }
        const result: Stored<JobRun>[] = [root as unknown as Stored<JobRun>];
        let frontier: string[] = [rootId];
        while (frontier.length > 0) {
            const children = await this.prisma.jobRun.findMany({
                where: { parentId: { in: frontier } },
                orderBy: { createdAt: 'asc' },
            });
            result.push(...(children as unknown as Stored<JobRun>[]));
            frontier = children.map((c) => c.id);
        }
        return result;
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
