import {
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { Stored, WorkerData, WorkerFinalPrompt } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { WorkersService } from './workers.service.js';
import { WorkersQueryDto } from './dto/workers-query.dto.js';

@Controller('workers')
@UseGuards(AuthGuard)
export class WorkersController {
    constructor(private readonly workers: WorkersService) {}

    @Get()
    list(@Query() query: WorkersQueryDto): Stored<WorkerData>[] {
        return this.workers.list(query);
    }

    @Get(':id/preview-prompt')
    previewPrompt(@Param('id') id: string): WorkerFinalPrompt {
        return this.workers.getPromptPreview(id);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string): Promise<void> {
        await this.workers.delete(id);
    }
}
