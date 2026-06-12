import {
    Controller,
    Get,
    GoneException,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { FileContent, Stored } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { FilesContentService } from './files-content.service.js';
import { FileContentQueryDto } from './dto/file-content-query.dto.js';
import { SoftDeleteContentQueryDto } from './dto/soft-delete-content-query.dto.js';

/** Read-only API над историческими записями `FileContent`. Синхронное извлечение — через DPS. */
@Controller('files-content')
@UseGuards(AuthGuard)
export class FilesContentController {
    constructor(private readonly filesContent: FilesContentService) {}

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

    /**
     * @deprecated Используйте DPS: `POST /documents/:fileId/prepare` или автоподготовку при upload.
     */
    @Post(':fileId/extract')
    async extract(@Param('fileId') _fileId: string): Promise<void> {
        throw new GoneException(
            'Эндпоинт устарел. Используйте Document Prepare Service: POST /documents/:fileId/prepare ' +
                'или автоподготовку при загрузке файла.',
        );
    }
}
