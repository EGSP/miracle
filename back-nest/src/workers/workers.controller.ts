import {
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { JobRun, Stored, WorkerFinalPrompt } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { WorkersService } from './workers.service.js';

/**
 * Эндпоинты прогонов durable-движка (`JobRun`). Контракт изменён относительно старого
 * `WorkerData` — см. BREAKING-CHANGES.md. Путь маршрута пока сохранён как `/workers`.
 */
@Controller('workers')
@UseGuards(AuthGuard)
export class WorkersController {
    constructor(private readonly workers: WorkersService) {}

    @Get()
    list(@Query('status') status?: string, @Query('sort') sort?: string): Promise<Stored<JobRun>[]> {
        return this.workers.list({ status, sort });
    }

    @Get(':id/preview-prompt')
    previewPrompt(@Param('id') id: string): Promise<WorkerFinalPrompt> {
        return this.workers.getPromptPreview(id);
    }

    @Post(':id/apply-worker-data')
    @HttpCode(204)
    async applyWorkerData(@Param('id') id: string): Promise<void> {
        await this.workers.applyWorkerData(id);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string): Promise<void> {
        await this.workers.delete(id);
    }
}
