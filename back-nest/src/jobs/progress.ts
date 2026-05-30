import type { JobRun } from '@miracle/types';

/** Этап прогресса заданной глубины. */
export type ProgressStage = {
    /** Имя этапа — идентификатор Job узла. */
    name: string;
    /** Доля этапа в общем прогрессе, %. Сумма weight всех этапов = 100. */
    weight: number;
    /** Текущий вклад этапа, 0..weight. Сумма progress всех этапов = общий прогресс прогона. */
    progress: number;
};

/** Степень готовности узла, 0..1 (рекурсивно по дереву). */
function completion(node: JobRun): number {
    if (node.status === 'succeeded') {
        return 1;
    }
    if (node.status === 'failed' || node.status === 'cancelled') {
        return 0;
    }
    if (node.steps && node.steps.length > 0) {
        const sum = node.steps.reduce((acc, child) => acc + completion(child), 0);
        return sum / node.steps.length;
    }
    // Листовой узел в работе: берём заявленный прогресс, иначе 0.
    return node.status === 'running' ? (node.progress?.pct ?? 0) / 100 : 0;
}

function expand(node: JobRun, weight: number, depth: number): ProgressStage[] {
    const hasChildren = Boolean(node.steps && node.steps.length > 0);
    // Глубина исчерпана или это лист → этап целиком.
    if (depth <= 0 || !hasChildren) {
        return [{ name: node.job, weight, progress: weight * completion(node) }];
    }
    const children = node.steps!;
    const childWeight = weight / children.length;
    return children.flatMap((child) => expand(child, childWeight, depth - 1));
}

/**
 * Раскладывает прогон на именованные этапы заданной глубины: у каждого — доля `weight`
 * (в сумме 100) и текущий вклад `progress` (в сумме = общий прогресс).
 *
 * Глубина клампится фактической структурой: если у узла нет детей раньше запрошенной глубины,
 * он становится листовым этапом. `depth = 1` — прямые дети корня (каждый по 100/N %).
 *
 * @example корневой Job из 4 операций, depth=1 → 4 этапа по weight=25; завершённый этап даёт progress=25.
 */
export function progressStages(run: JobRun, depth = 1): ProgressStage[] {
    return expand(run, 100, Math.max(1, Math.floor(depth)));
}

/** Общий прогресс прогона, % (0..100). */
export function overallProgress(run: JobRun): number {
    return completion(run) * 100;
}
