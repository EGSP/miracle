import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { DocumentPrepareController } from './document-prepare.controller.js';
import { DocumentPrepareService } from './document-prepare.service.js';
import { DocumentPrepareUploadListener } from './document-prepare-upload.listener.js';
import { KreuzbergHttpExtractor } from './adapters/kreuzberg-http.extractor.js';
import { LlmVisionExtractor } from './adapters/llm-vision.extractor.js';
import { KreuzbergConcurrencyLimiter } from './kreuzberg-concurrency.limiter.js';

@Module({
    imports: [AuthModule, FilesModule],
    controllers: [DocumentPrepareController],
    providers: [
        DocumentPrepareService,
        DocumentPrepareUploadListener,
        KreuzbergConcurrencyLimiter,
        KreuzbergHttpExtractor,
        LlmVisionExtractor,
    ],
    exports: [
        DocumentPrepareService,
        KreuzbergConcurrencyLimiter,
        KreuzbergHttpExtractor,
        LlmVisionExtractor,
    ],
})
export class DocumentPrepareModule {}
