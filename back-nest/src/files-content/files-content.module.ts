import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { FilesContentController } from './files-content.controller.js';
import { FilesContentService } from './files-content.service.js';
import { ExtractionService } from './extraction/extraction.service.js';

/**
 * Исторический модуль `FileContent`: read-only GET и soft-delete.
 *
 * **Deprecation (Фаза 6 DPS):** синхронное извлечение через `POST /files-content/:fileId/extract`
 * отключено (410). Новая подготовка — {@link DocumentPrepareService} (`POST /documents/:fileId/prepare`,
 * автоподготовка на upload). Код в `extraction/*` помечен `@deprecated`, таблица `file_contents` сохранена.
 */
@Module({
    imports: [AuthModule, FilesModule],
    controllers: [FilesContentController],
    providers: [FilesContentService, ExtractionService],
    exports: [FilesContentService],
})
export class FilesContentModule {}
