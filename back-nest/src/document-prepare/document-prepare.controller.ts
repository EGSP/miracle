import { Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import type { JobRun } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { DocumentPrepareService } from './document-prepare.service.js';

type PreparedDocumentResponse = NonNullable<Awaited<ReturnType<DocumentPrepareService['getLatestByFile']>>>;

type PrepareResponse = {
    prepared: PreparedDocumentResponse;
    jobRun: Pick<JobRun, 'id' | 'job' | 'status' | 'key'>;
};

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentPrepareController {
    constructor(private readonly documentPrepare: DocumentPrepareService) {}

    @Get(':fileId/prepared')
    async getPrepared(@Param('fileId') fileId: string): Promise<PreparedDocumentResponse> {
        const prepared = await this.documentPrepare.getLatestByFile(fileId);
        if (!prepared) {
            throw new NotFoundException('Подготовленный документ не найден');
        }
        return prepared;
    }

    @Post(':fileId/prepare')
    @HttpCode(200)
    async prepare(@Param('fileId') fileId: string): Promise<PrepareResponse> {
        const { prepared, jobRun } = await this.documentPrepare.enqueuePrepare(fileId);
        return {
            prepared,
            jobRun: {
                id: jobRun.id,
                job: jobRun.job,
                status: jobRun.status,
                key: jobRun.key,
            },
        };
    }
}
