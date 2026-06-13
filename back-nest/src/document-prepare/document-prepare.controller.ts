import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { PrepareStatus, PreparedDocument, Stored } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { DocumentPrepareService } from './document-prepare.service.js';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentPrepareController {
    constructor(private readonly documentPrepare: DocumentPrepareService) {}

    /** Подготовленный документ по файлу или `null`, если подготовки ещё не было. */
    @Get(':fileId')
    getPrepared(@Param('fileId') fileId: string): Promise<Stored<PreparedDocument> | null> {
        return this.documentPrepare.getLatestByFile(fileId);
    }

    /** Лёгкий статус подготовки для поллинга: `status` или `null`, если документа нет. */
    @Get(':fileId/status')
    async getStatus(
        @Param('fileId') fileId: string,
    ): Promise<{ status: PrepareStatus | null }> {
        const prepared = await this.documentPrepare.getLatestByFile(fileId);
        return { status: prepared?.status ?? null };
    }

    /**
     * Ставит (повторную) подготовку в очередь; возвращает id записи подготовки для трекинга.
     * Поле называется `runId` исторически (раньше — id job-прогона); теперь это id `PreparedDocument`.
     * Фронт его не использует — состояние читается поллингом `GET :fileId/status`.
     */
    @Post(':fileId/prepare')
    @HttpCode(200)
    async prepare(@Param('fileId') fileId: string): Promise<{ runId: string }> {
        const prepared = await this.documentPrepare.enqueuePrepare(fileId);
        return { runId: prepared.id };
    }
}
