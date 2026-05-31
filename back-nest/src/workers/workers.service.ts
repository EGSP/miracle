import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import type { JobRun, Stored, WorkerFinalPrompt } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import { JobRuntimeService } from '../jobs/job-runtime.service.js';

/** Рекурсивно ищет сохранённый промпт (`memo.finalPrompt`) в дереве прогона. */
function findFinalPrompt(node: JobRun): WorkerFinalPrompt | undefined {
    const prompt = node.memo?.['finalPrompt'];
    if (prompt && typeof prompt === 'object') {
        return prompt as WorkerFinalPrompt;
    }
    for (const child of node.steps ?? []) {
        const found = findFinalPrompt(child);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/**
 * Обслуживает прогоны durable-движка (`JobRun`). Заменяет прежнюю работу с `WorkerData`
 * (см. BREAKING-CHANGES.md): список прогонов, превью промпта, удаление, повторное применение.
 */
@Injectable()
export class WorkersService {
    constructor(
        private readonly db: DatabaseService,
        private readonly runtime: JobRuntimeService,
    ) {}

    list(query: { status?: string; sort?: 'asc' | 'desc' | string }): Stored<JobRun>[] {
        let result = this.db.collections.jobRuns
            .list()
            .filter((run) => (query.status ? run.status === query.status : true));

        if (query.sort === 'desc') {
            result = [...result].sort((a, b) => b.createdAt - a.createdAt);
        } else if (query.sort === 'asc') {
            result = [...result].sort((a, b) => a.createdAt - b.createdAt);
        }
        return result;
    }

    getPromptPreview(id: string): WorkerFinalPrompt {
        const run = this.db.collections.jobRuns.getById(id);
        if (!run) {
            throw new NotFoundException('Прогон не найден');
        }
        const prompt = findFinalPrompt(run);
        if (!prompt) {
            throw new NotFoundException('У прогона ещё нет сохранённого промпта');
        }
        return prompt;
    }

    applyWorkerData(id: string): Promise<void> {
        return this.runtime.applyById(id);
    }

    async delete(id: string): Promise<void> {
        const run = this.db.collections.jobRuns.getById(id);
        if (!run) {
            throw new NotFoundException('Прогон не найден');
        }
        if (run.status === 'running') {
            throw new ConflictException('Нельзя удалить активный прогон');
        }
        const isDeleted = await this.db.collections.jobRuns.delete(id);
        if (!isDeleted) {
            throw new InternalServerErrorException('Не удалось удалить прогон');
        }
    }
}
