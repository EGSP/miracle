import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { FilesContentController } from './files-content.controller.js';
import { FilesContentService } from './files-content.service.js';
import { ExtractionService } from './extraction/extraction.service.js';
import { ScanJobs } from './scan-jobs.service.js';

@Module({
    imports: [AuthModule, FilesModule],
    controllers: [FilesContentController],
    providers: [FilesContentService, ExtractionService, ScanJobs],
    exports: [FilesContentService],
})
export class FilesContentModule {}
