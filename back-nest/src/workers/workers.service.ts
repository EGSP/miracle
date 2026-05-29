import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import {
    WorkerStatus,
    type DesignationWorkerData,
    type OrderDetailsWorkerData,
    type Stored,
    type WorkerData,
    type WorkerFinalPrompt,
} from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import type { WorkersQueryDto } from './dto/workers-query.dto.js';

@Injectable()
export class WorkersService {
    constructor(private readonly db: DatabaseService) {}

    list(query: WorkersQueryDto): Stored<WorkerData>[] {
        let result = this.db.collections.workers
            .ref()
            .filter((worker) => (query.status ? worker.status === query.status : true));

        if (query.sort === 'desc') {
            result = [...result].sort((a, b) => b.createdAt - a.createdAt);
        } else if (query.sort === 'asc') {
            result = [...result].sort((a, b) => a.createdAt - b.createdAt);
        }

        return result;
    }

    getPromptPreview(id: string): WorkerFinalPrompt {
        const worker = this.db.collections.workers.getById(id);
        if (!worker) {
            throw new NotFoundException('Воркер не найден');
        }

        if (worker.type !== 'designation-worker' && worker.type !== 'order-details-worker') {
            throw new BadRequestException(
                `Превью промпта поддерживается только для designation-worker и order-details-worker (получен ${worker.type})`,
            );
        }

        // StoredEntity<WorkerData> теряет discriminated-union-нарроуинг (Omit & DbEntity),
        // поэтому приводим к типам воркеров, у которых поле finalPrompt существует.
        const promptWorker = worker as Stored<DesignationWorkerData | OrderDetailsWorkerData>;
        if (!promptWorker.finalPrompt) {
            throw new NotFoundException(
                'У воркера ещё нет сохранённого промпта (возможно, run() не успел стартовать или упал до сборки промпта)',
            );
        }

        return promptWorker.finalPrompt;
    }

    async delete(id: string): Promise<void> {
        const worker = this.db.collections.workers.getById(id);
        if (!worker) {
            throw new NotFoundException('Воркер не найден');
        }

        if (worker.status === WorkerStatus.Active) {
            throw new ConflictException('Нельзя удалить активный воркер');
        }

        const isDeleted = await this.db.collections.workers.delete(id);
        if (!isDeleted) {
            throw new InternalServerErrorException('Не удалось удалить воркер');
        }
    }
}
