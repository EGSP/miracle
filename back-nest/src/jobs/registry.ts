import type { JobId } from '@miracle/types';
import type { AnyJob } from './job.js';

/**
 * Реестр корневых Job по их id. Нужен для запуска по ключу и для восстановления прогонов
 * (по `JobRun.job` берём определение и пересобираем Effect). Домены регистрируют свои корневые
 * Job при инициализации (см. под-шаги 4.2+).
 */
const registry = new Map<JobId, AnyJob>();

export function registerJob(job: AnyJob): void {
    registry.set(job.id, job);
}

export function getJob(id: JobId): AnyJob | undefined {
    return registry.get(id);
}

export function allJobs(): AnyJob[] {
    return [...registry.values()];
}
