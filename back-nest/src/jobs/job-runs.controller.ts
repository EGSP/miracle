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
import { JobRunsQueryDto } from './dto/job-runs-query.dto.js';
import { JobRunsService } from './job-runs.service.js';

/**
 * Управление прогонами durable-движка задач (JobRun).
 * Заменяет прежний /workers — см. BREAKING-CHANGES.md.
 */
@Controller('jobs')
@UseGuards(AuthGuard)
export class JobRunsController {
    constructor(private readonly jobRuns: JobRunsService) {}

    @Get()
    list(@Query() query: JobRunsQueryDto): Promise<Stored<JobRun>[]> {
        return this.jobRuns.list(query);
    }

    @Get(':id/preview-prompt')
    previewPrompt(@Param('id') id: string): Promise<WorkerFinalPrompt> {
        return this.jobRuns.getPromptPreview(id);
    }

    @Post(':id/apply')
    @HttpCode(204)
    applyResult(@Param('id') id: string): Promise<void> {
        return this.jobRuns.applyResult(id);
    }

    @Post(':id/cancel')
    @HttpCode(204)
    cancel(@Param('id') id: string): Promise<void> {
        return this.jobRuns.cancel(id);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@Param('id') id: string): Promise<void> {
        return this.jobRuns.delete(id);
    }
}
