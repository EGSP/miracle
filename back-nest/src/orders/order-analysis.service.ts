import { Injectable } from '@nestjs/common';
import type { AnalyseOrderOptions, JobRun, Stored } from '@miracle/types';
import { JobsService } from '../jobs/jobs.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { OrderPositionsService } from './order-positions.service.js';
import { DesignationsService } from './designations.service.js';
import { FilesContentService } from '../files-content/files-content.service.js';

/** Стабильный ключ корневого прогона анализа заказа (v1). */
const analyseOrderKey = (orderId: string) => ['analyse-order', orderId] as const;

/** Стабильный ключ корневого прогона анализа заказа (v2). */
const analyseOrderV2Key = (orderId: string) => ['analyse-order-v2', orderId] as const;

const ACTIVE_STATUSES = new Set(['queued', 'running']);

/**
 * Выбирает «текущий» прогон анализа из прогонов всех вариантов (variant-agnostic): активный
 * (одновременно допустим только один — см. readiness) важнее, иначе — самый свежий по `updatedAt`.
 */
function pickCurrentAnalysisRun(runs: Array<Stored<JobRun> | null>): Stored<JobRun> | null {
    const present = runs.filter((run): run is Stored<JobRun> => run !== null);
    if (present.length === 0) return null;

    const active = present.find((run) => ACTIVE_STATUSES.has(run.status));
    if (active) return active;

    return present.reduce((latest, run) =>
        new Date(run.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? run : latest,
    );
}

/**
 * Триггер-слой анализа заказа. Здесь живут деструктивные операции переанализа (вне джоб, чтобы
 * тело `analyse-order` оставалось replay-safe): супрессия прежнего дерева прогонов и чистка данных
 * заказа. Сам анализ выполняет джоб `analyse-order` (запускается со стабильным ключом).
 */
@Injectable()
export class OrderAnalysisService {
    constructor(
        private readonly jobs: JobsService,
        private readonly applications: OrderApplicationsService,
        private readonly positions: OrderPositionsService,
        private readonly designations: DesignationsService,
        private readonly filesContent: FilesContentService,
    ) {}

    /**
     * (Пере)анализ заказа. По умолчанию супрессирует прежний прогон и чистит данные заказа, затем
     * запускает свежий `analyse-order`. При `deleteJobs=false` существующий прогон не трогается:
     * если он уже есть — возвращается как есть (без перезапуска).
     */
    async analyse(orderId: string, options: AnalyseOrderOptions): Promise<JobRun> {
        const key = analyseOrderKey(orderId);
        const existing = await this.jobs.findByKey([...key]);

        if (existing && !options.deleteJobs) {
            return existing;
        }

        if (existing) {
            if (existing.status === 'running' || existing.status === 'queued') {
                await this.jobs.cancel(existing.id);
            }
            await this.jobs.deleteRunTree(existing.id);
        }

        await this.wipeOrderData(orderId, options.deleteFileContent);

        return this.jobs.start('analyse-order', { orderId }, [...key]);
    }

    /**
     * (Пере)анализ заказа второй версией алгоритма (`analyse-order-v2`, см. README алгоритма).
     *
     * Ключевое отличие от {@link analyse}: при переанализе по умолчанию **переиспользуются уже
     * извлечённые позиции** — стираются только обозначения (они переопределяются каждый прогон).
     * Это «не платить за выведение позиций дважды». Принудительное переизвлечение — `forcePositions`:
     * тогда позиции (и обозначения) стираются, и джоб извлекает их заново.
     */
    async analyseV2(
        orderId: string,
        options: AnalyseOrderOptions,
        forcePositions = false,
    ): Promise<JobRun> {
        const key = analyseOrderV2Key(orderId);
        const existing = await this.jobs.findByKey([...key]);

        if (existing && !options.deleteJobs) {
            return existing;
        }

        if (existing) {
            if (existing.status === 'running' || existing.status === 'queued') {
                await this.jobs.cancel(existing.id);
            }
            await this.jobs.deleteRunTree(existing.id);
        }

        if (forcePositions) {
            await this.wipeOrderData(orderId, options.deleteFileContent); // позиции + обозначения
        } else {
            await this.wipeDesignations(orderId); // позиции сохраняем для переиспользования
        }

        return this.jobs.start('analyse-order-v2', { orderId }, [...key]);
    }

    /**
     * Текущий корневой прогон анализа заказа — variant-agnostic: смотрит прогоны ОБОИХ вариантов
     * (v1/v2) и возвращает активный, иначе самый свежий, иначе `null`. Чтение без побочных эффектов —
     * для тайла прогресса в карточке заказа (карточка не знает, каким вариантом запустили анализ).
     */
    async getRun(orderId: string): Promise<Stored<JobRun> | null> {
        const [v1, v2] = await Promise.all([
            this.jobs.findByKey([...analyseOrderKey(orderId)]),
            this.jobs.findByKey([...analyseOrderV2Key(orderId)]),
        ]);
        return pickCurrentAnalysisRun([v1 as Stored<JobRun> | null, v2 as Stored<JobRun> | null]);
    }

    /** Прогон анализа конкретного варианта (v1/v2) по его стабильному ключу или `null`. */
    async findRunForVariant(orderId: string, variantId: string): Promise<Stored<JobRun> | null> {
        const key = variantId === 'analyse-order-v2' ? analyseOrderV2Key(orderId) : analyseOrderKey(orderId);
        const run = await this.jobs.findByKey([...key]);
        return run as Stored<JobRun> | null;
    }

    /** Сносит только обозначения заказа, сохраняя позиции (переиспользование извлечения в v2). */
    private async wipeDesignations(orderId: string): Promise<void> {
        const apps = await this.applications.listByOrder(orderId);
        const positionLists = await Promise.all(apps.map((app) => this.positions.listByApplication(app.id)));
        const positionIds = positionLists.flat().map((p) => p.id);
        await this.designations.deleteByPositions(positionIds);
    }

    /** Чистый лист: всегда сносит позиции и обозначения заказа; FileContent — по флагу. */
    private async wipeOrderData(orderId: string, deleteFileContent: boolean): Promise<void> {
        const apps = await this.applications.listByOrder(orderId);
        const appIds = apps.map((a) => a.id);

        const positionLists = await Promise.all(appIds.map((id) => this.positions.listByApplication(id)));
        const positionIds = positionLists.flat().map((p) => p.id);

        await this.designations.deleteByPositions(positionIds);
        await this.positions.deleteByApplications(appIds);

        if (deleteFileContent) {
            const fileIds = apps.flatMap((a) => (a.data.type === 'file' ? [a.data.fileId] : []));
            await Promise.all(fileIds.map((fileId) => this.filesContent.deleteByFile(fileId)));
        }
    }
}
