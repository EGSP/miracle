import type { JobId } from '@miracle/types';
import type { AnyJob } from './job.js';

/**
 * Реестр корневых джобов по id. Нужен для восстановления: из записи прогона известен только
 * строковый `job`, а тело (для повторного проигрывания) берётся отсюда. Домены регистрируют
 * свои корневые джобы при инициализации.
 */
const registry = new Map<JobId, AnyJob>();

/**
 * Регистрирует корневой джоб по его `id`. Повторная регистрация с тем же `id` перезаписывает
 * запись. Вызывается на старте (`JobsService` находит провайдеры с маркером `@JobImpl` и
 * регистрирует их), чтобы при восстановлении прогона по строковому `job` найти его тело.
 */
export function registerJob(job: AnyJob): void {
    registry.set(job.id, job);
}

/** Возвращает зарегистрированный джоб по `id` или `undefined`, если он не зарегистрирован. */
export function getJob(id: JobId): AnyJob | undefined {
    return registry.get(id);
}

/** Все зарегистрированные джобы (снимок значений реестра). */
export function allJobs(): AnyJob[] {
    return [...registry.values()];
}
