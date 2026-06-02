import type { JobId } from '@miracle/types';
import type { AnyJob } from './job.js';

/**
 * Реестр корневых джобов по id. Нужен для восстановления: из записи прогона известен только
 * строковый `job`, а тело (для повторного проигрывания) берётся отсюда. Домены регистрируют
 * свои корневые джобы при инициализации.
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
