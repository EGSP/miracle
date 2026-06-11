import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { DocumentPrepareController } from './document-prepare.controller.js';
import { DocumentPrepareService } from './document-prepare.service.js';
import { KreuzbergConcurrencyLimiter } from './kreuzberg-concurrency.limiter.js';

@Module({
    imports: [AuthModule, FilesModule],
    controllers: [DocumentPrepareController],
    providers: [DocumentPrepareService, KreuzbergConcurrencyLimiter],
    exports: [DocumentPrepareService, KreuzbergConcurrencyLimiter],
})
export class DocumentPrepareModule {}
