import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import type { JobRun, JobRunsQuery, Stored, WorkerFinalPrompt } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { JobRuntimeService } from './job-runtime.service.js';

/** Рекурсивно ищет сохранённый промпт (`memo.finalPrompt`) в дереве прогона. */
function findFinalPrompt(node: JobRun): WorkerFinalPrompt | undefined {
    const prompt = node.memo?.['finalPrompt'];
    if (prompt && typeof prompt === 'object') {
        return prompt as WorkerFinalPrompt;
    }
    for (const child of node.steps ?? []) {
        const found = findFinalPrompt(child);
        if (found) return found;
    }
    return undefined;
}

@Injectable()
export class JobRunsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly runtime: JobRuntimeService,
    ) {}

    async list(query: JobRunsQuery): Promise<Stored<JobRun>[]> {
        const rows = await this.prisma.jobRun.findMany({
            where: query.status ? { status: query.status } : undefined,
            orderBy: query.sort ? { createdAt: query.sort } : undefined,
        });
        return rows as unknown as Stored<JobRun>[];
    }

    async getPromptPreview(id: string): Promise<WorkerFinalPrompt> {
        const row = await this.prisma.jobRun.findUnique({ where: { id } });
        if (!row) {
            throw new NotFoundException('Прогон не найден');
        }
        const prompt = findFinalPrompt(row as unknown as JobRun);
        if (!prompt) {
            throw new NotFoundException('У прогона ещё нет сохранённого промпта');
        }
        return prompt;
    }

    applyResult(id: string): Promise<void> {
        return this.runtime.applyById(id);
    }

    cancel(id: string): Promise<void> {
        return this.runtime.cancel(id);
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
