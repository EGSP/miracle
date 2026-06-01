import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import type { JobRun, Stored, WorkerFinalPrompt } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
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
        private readonly prisma: PrismaService,
        private readonly runtime: JobRuntimeService,
    ) {}

    async list(query: { status?: string; sort?: 'asc' | 'desc' | string }): Promise<Stored<JobRun>[]> {
        const rows = await this.prisma.jobRun.findMany({
            where: query.status ? { status: query.status as 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' } : undefined,
            orderBy: query.sort === 'asc' || query.sort === 'desc'
                ? { createdAt: query.sort }
                : undefined,
        });
        return rows as unknown as Stored<JobRun>[];
    }

    async getPromptPreview(id: string): Promise<WorkerFinalPrompt> {
        const run = await this.prisma.jobRun.findUnique({ where: { id } });
        if (!run) {
            throw new NotFoundException('Прогон не найден');
        }
        const runDomain = run as unknown as JobRun;
        const prompt = findFinalPrompt(runDomain);
        if (!prompt) {
            throw new NotFoundException('У прогона ещё нет сохранённого промпта');
        }
        return prompt;
    }

    applyWorkerData(id: string): Promise<void> {
        return this.runtime.applyById(id);
    }

    async delete(id: string): Promise<void> {
        const run = await this.prisma.jobRun.findUnique({ where: { id } });
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
