import {
    BadRequestException,
    Body,
    Controller,
    Get,
    NotFoundException,
    Param,
    Patch,
    PayloadTooLargeException,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream, existsSync, statSync } from 'fs';
import { stat, unlink } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import type { FileModel, FileWithMeta } from '@miracle/types';
import { getContentType } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { UploadedFile } from '../common/uploaded-file.decorator.js';
import { FilesService } from './files.service.js';
import { FILE_UPLOAD_CONFIG } from './file-upload.config.js';
import { fixFileNameEncoding } from './file-name-encoding.js';
import { PatchFileDto } from './dto/patch-file.dto.js';
import { FilesQueryDto } from './dto/files-query.dto.js';

const ALLOWED_MIME_TYPES = FILE_UPLOAD_CONFIG.allowedMimeTypes as readonly string[];

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
    constructor(private readonly files: FilesService) {}

    @Get()
    getFiles(@Query() query: FilesQueryDto): FileWithMeta[] {
        return this.files.getFiles(query);
    }

    @Post('upload')
    async upload(
        @Req() req: FastifyRequest,
        @UploadedFile() _file: unknown,
        @CurrentUser() user: AuthenticatedUser,
    ): Promise<FileModel> {
        const data = await req.file();
        if (!data) {
            throw new BadRequestException('No file provided');
        }

        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
            data.file.resume();
            throw new BadRequestException(`File type "${data.mimetype}" is not allowed`);
        }

        const originalName = fixFileNameEncoding(data.filename);
        const ext = path.extname(originalName);
        const extension = ext ? ext.slice(1) : '';
        const id = randomUUID();
        const targetPath = path.join(
            this.files.getUploadsDir(),
            extension ? `${id}.${extension}` : id,
        );

        await pipeline(data.file, createWriteStream(targetPath));

        if (data.file.truncated) {
            await unlink(targetPath);
            throw new PayloadTooLargeException(
                `File exceeds the ${FILE_UPLOAD_CONFIG.maxSizeBytes} byte limit`,
            );
        }

        const { size } = await stat(targetPath);

        return this.files.create({
            id,
            name: originalName,
            extension,
            bytes: size,
            pages: undefined,
            authorId: user.id,
        });
    }

    @Patch(':id')
    async patch(@Param('id') id: string, @Body() body: PatchFileDto): Promise<FileModel> {
        const updated = await this.files.patch(id, body.settings);
        if (!updated) {
            throw new NotFoundException(`File with id "${id}" not found`);
        }
        return updated;
    }

    @Post(':id/restore')
    async restore(
        @Param('id') id: string,
        @UploadedFile() _file: unknown,
        @Req() req: FastifyRequest,
    ): Promise<FileModel> {
        const data = await req.file();
        if (!data) {
            throw new BadRequestException('No file provided');
        }

        const existing = this.files.get(id);
        if (!existing) {
            data.file.resume();
            throw new NotFoundException(`File with id "${id}" not found`);
        }

        const uploadedExt = path
            .extname(fixFileNameEncoding(data.filename))
            .slice(1)
            .toLowerCase();
        if (uploadedExt !== existing.extension.toLowerCase()) {
            data.file.resume();
            throw new BadRequestException(
                `Extension mismatch: expected .${existing.extension}, got .${uploadedExt}`,
            );
        }

        const targetPath = this.files.getFilePath(existing);
        await pipeline(data.file, createWriteStream(targetPath));

        if (data.file.truncated) {
            await unlink(targetPath);
            throw new PayloadTooLargeException(
                `File exceeds the ${FILE_UPLOAD_CONFIG.maxSizeBytes} byte limit`,
            );
        }

        return existing;
    }

    @Get(':id/content')
    streamContent(
        @Param('id') id: string,
        @Req() req: FastifyRequest,
        @Res() reply: FastifyReply,
    ): void {
        const file = this.files.get(id);
        if (!file) {
            throw new NotFoundException(`File with id "${id}" not found`);
        }

        const filePath = this.files.getFilePath(file);
        if (!existsSync(filePath)) {
            throw new NotFoundException('File content is not available');
        }

        const contentType = getContentType(file.extension);
        const filename = encodeURIComponent(file.name);
        const stats = statSync(filePath);
        const range = req.headers.range;

        reply.header('Content-Type', contentType);
        reply.header('Content-Disposition', `inline; filename*=UTF-8''${filename}`);
        reply.header('Accept-Ranges', 'bytes');

        if (range) {
            const match = range.match(/^bytes=(\d*)-(\d*)$/u);
            if (!match) {
                reply.code(416).header('Content-Range', `bytes */${stats.size}`).send();
                return;
            }

            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Number(match[2]) : stats.size - 1;
            if (start >= stats.size || end >= stats.size || start > end) {
                reply.code(416).header('Content-Range', `bytes */${stats.size}`).send();
                return;
            }

            reply.code(206);
            reply.header('Content-Length', (end - start + 1).toString());
            reply.header('Content-Range', `bytes ${start}-${end}/${stats.size}`);
            reply.send(createReadStream(filePath, { start, end }));
            return;
        }

        reply.header('Content-Length', stats.size.toString());
        reply.send(createReadStream(filePath));
    }
}
