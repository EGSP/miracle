import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { FilesContentController } from './files-content.controller.js';
import { FilesContentService } from './files-content.service.js';

/**
 * Исторический модуль `FileContent`: read-only GET и soft-delete.
 *
 * Синхронное извлечение удалено (Фаза 7 DPS). `POST /files-content/:fileId/extract` — 410.
 * Новая подготовка — Document Prepare Service. Таблица `file_contents` сохранена.
 */
@Module({
    imports: [AuthModule, FilesModule],
    controllers: [FilesContentController],
    providers: [FilesContentService],
    exports: [FilesContentService],
})
export class FilesContentModule {}
