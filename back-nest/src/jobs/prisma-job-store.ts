import type { JobRun, JobStatus } from '@miracle/types';
import type { PrismaService } from '../database/prisma.service.js';
import type { CreateRunInput, JobRunPatch, JobStore } from './framework/index.js';

/** Реализация порта {@link JobStore} поверх Prisma. Строки `job_runs` плоские. */
export function createPrismaJobStore(prisma: PrismaService): JobStore {
    const toRun = (row: unknown): JobRun => row as unknown as JobRun;

    return {
        async findOrCreate(data: CreateRunInput): Promise<JobRun> {
            // Race-safe: уникальный индекс по keyHash делает upsert атомарным. update:{} —
            // no-op, поэтому при совпадении возвращается существующая строка как есть.
            const row = await prisma.jobRun.upsert({
                where: { keyHash: data.keyHash },
                create: {
                    job: data.job,
                    parentId: data.parentId,
                    key: data.key as object,
                    keyHash: data.keyHash,
                    status: 'queued' satisfies JobStatus,
                    input: data.input !== undefined ? (data.input as object) : undefined,
                },
                update: {},
            });
            return toRun(row);
        },

        async findById(id: string): Promise<JobRun | null> {
            const row = await prisma.jobRun.findUnique({ where: { id } });
            return row ? toRun(row) : null;
        },

        async findByKeyHash(keyHash: string): Promise<JobRun | null> {
            const row = await prisma.jobRun.findUnique({ where: { keyHash } });
            return row ? toRun(row) : null;
        },

        async childrenOf(parentId: string): Promise<JobRun[]> {
            const rows = await prisma.jobRun.findMany({ where: { parentId } });
            return rows.map(toRun);
        },

        async roots(statuses: JobStatus[]): Promise<JobRun[]> {
            const rows = await prisma.jobRun.findMany({
                where: { parentId: null, status: { in: statuses } },
            });
            return rows.map(toRun);
        },

        async patch(id: string, patch: JobRunPatch): Promise<void> {
            await prisma.jobRun.update({
                where: { id },
                data: {
                    ...(patch.status !== undefined ? { status: patch.status as JobStatus } : {}),
                    ...(patch.output !== undefined ? { output: patch.output as object } : {}),
                    // 'error' присутствует даже со значением undefined (сброс) → пишем null.
                    ...('error' in patch ? { error: patch.error ?? null } : {}),
                    ...(patch.progress !== undefined ? { progress: patch.progress as object } : {}),
                    ...(patch.memo !== undefined ? { memo: patch.memo as object } : {}),
                },
            });
        },
    };
}
