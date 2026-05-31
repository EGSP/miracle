import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { JobRuntimeService } from '../jobs/job-runtime.service.js';
import { TechnicalConditionsService } from './technical-conditions.service.js';
import { TcJobs } from './tc-jobs.service.js';

@Controller('technical-conditions')
@UseGuards(AuthGuard)
export class TechnicalConditionsController {
    constructor(
        private readonly tc: TechnicalConditionsService,
        private readonly runtime: JobRuntimeService,
        private readonly tcJobs: TcJobs,
    ) {}

    @Get()
    list(@Query('productTypeId') productTypeId?: string): Stored<TechnicalCondition>[] {
        return productTypeId ? this.tc.getByProductTypeId(productTypeId) : this.tc.getAll();
    }

    @Post()
    create(@Body() body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        return this.tc.create(body);
    }

    @Get(':id')
    getOne(@Param('id') id: string): Stored<TechnicalCondition> {
        return this.tc.getByIdOrThrow(id);
    }

    @Put(':id')
    replace(@Param('id') id: string, @Body() body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        return this.tc.replace(id, body);
    }

    // Запускает durable-прогон разбора ТУ; возвращает id прогона для слежения.
    @Post(':id/extract-details')
    @HttpCode(202)
    async extractDetails(@Param('id') id: string): Promise<{ runId: string }> {
        const tc = this.tc.getByIdOrThrow(id);
        if (!tc.fileId) {
            throw new BadRequestException('TC не имеет прикреплённого PDF-файла');
        }
        const run = await this.runtime.start(this.tcJobs.tcExtract, { tcId: id });
        return { runId: run.id };
    }
}
