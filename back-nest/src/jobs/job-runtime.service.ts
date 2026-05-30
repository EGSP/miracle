import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Cause, Effect, Fiber, Layer } from 'effect';
import type { JobRun, JobStatus } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import type { AnyJob } from './job.js';
import { getJob } from './registry.js';
import { runNode } from './runner.js';

/**
 * `@Global` мост Effect↔Nest: запускает durable-прогоны Job, трекает волокна, восстанавливает
 * незавершённые прогоны при старте. Доменные сервисы/вендоры подаются Effect-слоем
 * (`servicesLayer`) — он наполняется по мере появления доменов (под-шаги 4.1+).
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

    /** Слой реализаций сервисов/вендоров для Effect. Наполняется по мере миграции доменов. */
    private servicesLayer(): Layer.Layer<never> {
        return Layer.empty;
    }

    private persist = async (root: JobRun): Promise<void> => {
        await this.db.collections.jobRuns.update(root.id, root);
    };

    /** Запускает прогон Job: создаёт корневую запись и форкает исполнение. */
    async start(job: AnyJob, input: unknown): Promise<JobRun> {
        const root = await this.db.collections.jobRuns.create({
            job: job.id,
            status: 'queued' satisfies JobStatus,
            input,
        });
        this.launch(job, root);
        return root;
    }

    private launch(job: AnyJob, root: JobRun): void {
        const runnable = runNode(job, root, root, this.persist).pipe(
            Effect.provide(this.servicesLayer()),
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

    /** Повторно применяет результат (терминальный apply-узел) — для apply-worker-data (под-шаг 4.6). */
    async applyById(_runId: string): Promise<void> {
        // Реализация в под-шаге 4.6.
    }

    async onApplicationBootstrap(): Promise<void> {
        // Восстановление прогонов running/queued — под-шаг 4.5.
        void getJob;
    }
}
