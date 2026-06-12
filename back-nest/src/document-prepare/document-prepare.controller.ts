import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { DocumentPrepareService } from './document-prepare.service.js';

type PreparedDocumentResponse = NonNullable<Awaited<ReturnType<DocumentPrepareService['getLatestByFile']>>>;

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentPrepareController {
    constructor(private readonly documentPrepare: DocumentPrepareService) {}

    /** Подготовленный документ по файлу или `null`, если подготовки ещё не было. */
    @Get(':fileId')
    getPrepared(@Param('fileId') fileId: string): Promise<PreparedDocumentResponse | null> {
        return this.documentPrepare.getLatestByFile(fileId);
    }

    /** Лёгкий статус подготовки для поллинга: `status` или `null`, если документа нет. */
    @Get(':fileId/status')
    async getStatus(
        @Param('fileId') fileId: string,
    ): Promise<{ status: PreparedDocumentResponse['status'] | null }> {
        const prepared = await this.documentPrepare.getLatestByFile(fileId);
        return { status: prepared?.status ?? null };
    }

    /** Ставит (повторную) подготовку в очередь; возвращает id прогона для трекинга. */
    @Post(':fileId/prepare')
    @HttpCode(200)
    async prepare(@Param('fileId') fileId: string): Promise<{ runId: string }> {
        const run = await this.documentPrepare.enqueuePrepare(fileId);
        return { runId: run.id };
    }
}
