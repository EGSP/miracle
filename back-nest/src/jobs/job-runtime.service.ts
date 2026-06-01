import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Cause, Effect, Fiber } from 'effect';
import type { JobId, JobRun, JobStatus } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import type { AnyJob, Job } from './job.js';
import { getJob } from './registry.js';
import { runNode } from './runner.js';

/**
 * `@Global` мост Effect↔Nest: запускает durable-прогоны Job, трекает волокна, восстанавливает
 * незавершённые прогоны при старте, поддерживает отмену и повторное применение результата.
 * Доменные сервисы/вендоры приходят в листья Job замыканием (фабрики доменов), не через Effect-слой.
 */
@Injectable()
export class JobRuntimeService implements OnApplicationBootstrap {
    private readonly logger: AppLogger;
    private readonly fibers = new Map<string, Fiber.RuntimeFiber<unknown, unknown>>();

    constructor(
        private readonly prisma: PrismaService,
        @Inject(AppLoggerService) private readonly loggerFactory: AppLoggerService,
    ) {
        this.logger = this.loggerFactory.forContext(JobRuntimeService.name);
    }

    private persist = async (root: JobRun): Promise<void> => {
        await this.prisma.jobRun.update({
            where: { id: root.id },
            data: {
                status: root.status as JobStatus,
                input: root.input !== undefined ? (root.input as object) : undefined,
                output: root.output !== undefined ? (root.output as object) : undefined,
                error: root.error ?? null,
                progress: root.progress !== undefined ? (root.progress as object) : undefined,
                memo: root.memo !== undefined ? (root.memo as object) : undefined,
                cursor: root.cursor ?? null,
                steps: root.steps !== undefined ? (root.steps as object) : undefined,
            },
        });
    };

    /** Запускает прогон Job: создаёт корневую запись и форкает исполнение. */
    async start<Input>(job: Job<Input, unknown, any>, input: Input): Promise<JobRun> {
        const row = await this.prisma.jobRun.create({
            data: {
                job: job.id,
                status: 'queued' satisfies JobStatus,
                input: input !== undefined ? (input as object) : undefined,
            },
        });
        const root = row as unknown as JobRun;
        this.launch(job, root as JobRun);
        return root;
    }

    private launch(job: AnyJob, root: JobRun): void {
        const runnable = runNode(job, root, root, this.persist).pipe(
            Effect.catchAllCause((cause) =>
                Effect.sync(() =>
                    this.logger.error(`прогон "${root.id}" (${root.job}) упал`, Cause.squash(cause)),
                ),
            ),
        ) as Effect.Effect<void, never, never>;

        const fiber = Effect.runFork(runnable);
        this.fibers.set(root.id, fiber);
        fiber.addObserver(() => {
            this.fibers.delete(root.id);
        });
    }

    /** Отменяет прогон: прерывает волокно и помечает запись `cancelled`. */
    async cancel(runId: string): Promise<void> {
        const fiber = this.fibers.get(runId);
        if (fiber) {
            await Effect.runPromise(Fiber.interrupt(fiber));
        }
        const row = await this.prisma.jobRun.findUnique({ where: { id: runId } });
        if (row && (row.status === 'running' || row.status === 'queued')) {
            await this.prisma.jobRun.update({
                where: { id: runId },
                data: { status: 'cancelled' },
            });
        }
    }

    /**
     * Повторно применяет результат: сбрасывает терминальный (apply) шаг в `queued` и заново гоняет прогон.
     * Раннер пропустит ранее завершённые шаги (их выход переиспользуется) и выполнит только apply.
     */
    async applyById(runId: string): Promise<void> {
        const row = await this.prisma.jobRun.findUnique({ where: { id: runId } });
        if (!row) {
            throw new Error('Прогон не найден');
        }
        if (row.status !== 'succeeded') {
            throw new Error('Применение возможно только для завершённого (succeeded) прогона');
        }
        // row.job — string из Prisma; реестр хранит JobId (брендированный string) → приводим явно
        const job = getJob(row.job as JobId);
        if (!job) {
            throw new Error(`Нет определения job "${row.job}" — применение невозможно`);
        }

        const run = row as unknown as JobRun;

        if (run.steps && run.steps.length > 0) {
            const last = run.steps[run.steps.length - 1];
            last.status = 'queued';
            delete last.output;
            run.cursor = run.steps.length - 1;
        }
        run.status = 'running';
        await this.persist(run);
        this.launch(job, run);
    }

    /** Восстанавливает незавершённые прогоны (running/queued) после перезапуска процесса. */
    async onApplicationBootstrap(): Promise<void> {
        const rows = await this.prisma.jobRun.findMany({
            where: { status: { in: ['running', 'queued'] } },
        });

        for (const row of rows) {
            const job = getJob(row.job as JobId);
            if (!job) {
                this.logger.warn(`Прогон "${row.id}": нет определения job "${row.job}" — пропущен`);
                continue;
            }
            this.logger.info(`Восстановление прогона "${row.id}" (${row.job})`);
            this.launch(job, row as unknown as JobRun);  // row.job: string → cast через unknown до JobRun
        }
    }
}
