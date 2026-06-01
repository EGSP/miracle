import {
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { FileContent, Stored } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { FilesContentService } from './files-content.service.js';
import { ExtractionService } from './extraction/extraction.service.js';
import { FileContentQueryDto } from './dto/file-content-query.dto.js';
import { SoftDeleteContentQueryDto } from './dto/soft-delete-content-query.dto.js';
import { ExtractContentQueryDto } from './dto/extract-content-query.dto.js';

@Controller('files-content')
@UseGuards(AuthGuard)
export class FilesContentController {
    constructor(
        private readonly filesContent: FilesContentService,
        private readonly extraction: ExtractionService,
    ) {}

    @Get('records/:contentId/tokens')
    async getTokens(@Param('contentId') contentId: string): Promise<{ tokens: number }> {
        return { tokens: await this.filesContent.getTokenCount(contentId) };
    }

    @Post('records/:contentId')
    @HttpCode(204)
    async softDelete(
        @Param('contentId') contentId: string,
        @Query() query: SoftDeleteContentQueryDto,
    ): Promise<void> {
        await this.filesContent.softDelete(contentId, query.mark);
    }

    @Get(':fileId')
    async getContent(
        @Param('fileId') fileId: string,
        @Query() query: FileContentQueryDto,
    ): Promise<Stored<FileContent>[]> {
        const content = await this.filesContent.getContent(fileId, {
            includeDeleted: query.includeDeleted === true,
        });
        if (query.onlyLast) {
            return content.length > 0 ? [content[0]] : [];
        }
        return content;
    }

    @Post(':fileId/extract')
    @HttpCode(204)
    async extract(
        @Param('fileId') fileId: string,
        @Query() query: ExtractContentQueryDto,
    ): Promise<void> {
        await this.extraction.extract(fileId, { retryIfLastFailed: query.retryIfLastFailed });
    }
}
