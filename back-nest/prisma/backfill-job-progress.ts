/**
 * Одноразовый backfill: прогоны с `progress IS NULL` получают синтетический снимок по статусу.
 *
 * Важно: для Json? в Prisma `{ equals: null }` — это JSON null, не SQL NULL.
 * Поэтому выборка идёт через raw SQL (`progress IS NULL`).
 *
 * Запуск: npm run prisma:backfill-job-progress --workspace=back-nest
 * Dry-run: npm run prisma:backfill-job-progress --workspace=back-nest -- --dry-run
 */
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import type { JobProgress, JobProgressState, JobStatus } from '@miracle/types';
import { JobStatus as PrismaJobStatus, PrismaClient } from '../src/generated/prisma/client.js';

const dryRun = process.argv.includes('--dry-run');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type RunRow = {
    id: string;
    job: string;
    status: JobStatus;
    updatedAt: Date;
};

/** Синтетический снимок прогресса для backfill — не отражает реальную историю выполнения. */
function snapshotForStatus(status: JobStatus, createdAt: number): JobProgressState {
    switch (status) {
        case 'queued':
            return { percentNormalized: 0, determined: true, label: 'в очереди', createdAt };
        case 'running':
            return { percentNormalized: 0, determined: false, label: 'выполняется', createdAt };
        case 'succeed':
            return { percentNormalized: 1, determined: true, label: 'завершено', createdAt };
        case 'partial':
            return { percentNormalized: 1, determined: true, label: 'частично', createdAt };
        case 'failed':
            return { percentNormalized: 0, determined: true, label: 'ошибка', createdAt };
        case 'cancelled':
            return { percentNormalized: 0, determined: true, label: 'отменено', createdAt };
    }
}

function progressForStatus(status: JobStatus, createdAt: number): JobProgress {
    return { states: [snapshotForStatus(status, createdAt)] };
}

const prismaStatusValues = Object.values(PrismaJobStatus) as JobStatus[];

async function loadRunsWithoutProgress(): Promise<RunRow[]> {
    const { rows } = await pool.query<RunRow>(
        `SELECT id, job, status, "updatedAt"
         FROM job_runs
         WHERE progress IS NULL
         ORDER BY "createdAt" ASC`,
    );
    return rows;
}

async function main(): Promise<void> {
    const runs = await loadRunsWithoutProgress();

    if (runs.length === 0) {
        console.log('Нет прогонов с progress IS NULL.');
        return;
    }

    const byStatus = Object.fromEntries(prismaStatusValues.map((s) => [s, 0])) as Record<
        JobStatus,
        number
    >;

    for (const run of runs) {
        byStatus[run.status] += 1;
    }

    console.log(
        dryRun
            ? `Dry-run: будет обновлено ${runs.length} прогонов:`
            : `Обновление ${runs.length} прогонов с progress IS NULL:`,
    );
    for (const status of prismaStatusValues) {
        if (byStatus[status] > 0) {
            console.log(`  ${status}: ${byStatus[status]}`);
        }
    }

    if (dryRun) return;

    let updated = 0;
    for (const run of runs) {
        const progress = progressForStatus(run.status, run.updatedAt.getTime());
        await prisma.jobRun.update({
            where: { id: run.id },
            data: { progress },
        });
        updated += 1;
    }

    console.log(`Готово: обновлено ${updated} прогонов.`);
}

main()
    .catch((e) => {
        console.error('Backfill завершился с ошибкой:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
