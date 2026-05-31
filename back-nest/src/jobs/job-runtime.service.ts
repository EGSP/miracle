import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Cause, Effect, Fiber } from 'effect';
import type { JobRun, JobStatus } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
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
        private readonly db: DatabaseService,
        loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(JobRuntimeService.name);
    }

    private persist = async (root: JobRun): Promise<void> => {
        await this.db.collections.jobRuns.update(root.id, root);
    };

    /** Запускает прогон Job: создаёт корневую запись и форкает исполнение. */
    async start<Input>(job: Job<Input, unknown, any>, input: Input): Promise<JobRun> {
        const root = await this.db.collections.jobRuns.create({
            job: job.id,
            status: 'queued' satisfies JobStatus,
            input,
        });
        this.launch(job, root);
        return root;
    }

    private launch(job: AnyJob, root: JobRun): void {
        // Сервисы/вендоры приходят в листья замыканием (через фабрики доменов); раннер сам
        // провайдит Memo/Progress, поэтому к моменту запуска требований (R) у эффекта нет.
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
        const run = this.db.collections.jobRuns.getById(runId);
        if (run && (run.status === 'running' || run.status === 'queued')) {
            run.status = 'cancelled';
            await this.persist(run);
        }
    }

    /**
     * Повторно применяет результат: сбрасывает терминальный (apply) шаг в `queued` и заново гоняет прогон.
     * Раннер пропустит ранее завершённые шаги (их выход переиспользуется) и выполнит только apply.
     */
    async applyById(runId: string): Promise<void> {
        const run = this.db.collections.jobRuns.getById(runId);
        if (!run) {
            throw new Error('Прогон не найден');
        }
        if (run.status !== 'succeeded') {
            throw new Error('Применение возможно только для завершённого (succeeded) прогона');
        }
        const job = getJob(run.job);
        if (!job) {
            throw new Error(`Нет определения job "${run.job}" — применение невозможно`);
        }

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
        const runs = this.db.collections.jobRuns
            .list()
            .filter((run) => run.status === 'running' || run.status === 'queued');

        for (const run of runs) {
            const job = getJob(run.job);
            if (!job) {
                this.logger.warn(`Прогон "${run.id}": нет определения job "${run.job}" — пропущен`);
                continue;
            }
            this.logger.info(`Восстановление прогона "${run.id}" (${run.job})`);
            this.launch(job, run);
        }
    }
}
