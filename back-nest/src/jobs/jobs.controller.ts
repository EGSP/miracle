import { Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { JobRun, Stored, WorkerFinalPrompt } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { JobRunsQueryDto } from './dto/job-runs-query.dto.js';
import { JobsService } from './jobs.service.js';

/** Управление прогонами durable-движка задач (JobRun). */
@Controller('jobs')
@UseGuards(AuthGuard)
export class JobsController {
    constructor(private readonly jobs: JobsService) {}

    @Get()
    list(@Query() query: JobRunsQueryDto): Promise<Stored<JobRun>[]> {
        return this.jobs.list(query);
    }

    @Get(':id/preview-prompt')
    previewPrompt(@Param('id') id: string): Promise<WorkerFinalPrompt> {
        return this.jobs.getPromptPreview(id);
    }

    @Post(':id/cancel')
    @HttpCode(204)
    cancel(@Param('id') id: string): Promise<void> {
        return this.jobs.cancel(id);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@Param('id') id: string): Promise<void> {
        return this.jobs.delete(id);
    }
}
