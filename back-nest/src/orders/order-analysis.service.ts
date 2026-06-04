import { Injectable } from '@nestjs/common';
import type { AnalyseOrderOptions, JobRun, Stored } from '@miracle/types';
import { JobsService } from '../jobs/jobs.service.js';
import { OrderApplicationsService } from './order-applications.service.js';
import { OrderPositionsService } from './order-positions.service.js';
import { DesignationsService } from './designations.service.js';
import { FilesContentService } from '../files-content/files-content.service.js';

/** Стабильный ключ корневого прогона анализа заказа. */
const analyseOrderKey = (orderId: string) => ['analyse-order', orderId] as const;

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
     * Текущий корневой прогон анализа заказа (по стабильному ключу) или `null`, если анализ ещё не
     * запускался. Чтение без побочных эффектов — для тайла прогресса в карточке заказа.
     */
    async getRun(orderId: string): Promise<Stored<JobRun> | null> {
        const run = await this.jobs.findByKey([...analyseOrderKey(orderId)]);
        return run as Stored<JobRun> | null;
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
