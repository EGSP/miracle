import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { formatUnknown } from '../common/effect-errors.js';
import { FilesService } from '../files/files.service.js';
import { AppLoggerService, type AppLogger } from '../logger/app-logger.service.js';
import { DocumentPrepareService } from './document-prepare.service.js';
import { routePreparedEngine } from './router.js';

/**
 * Подписывается на {@link FilesService.onFileSaved} и ставит prepare-document для поддерживаемых форматов.
 * DPS сам инициирует разметку; FilesService о хуке DPS не знает.
 */
@Injectable()
export class DocumentPrepareUploadListener implements OnModuleInit {
    private readonly logger: AppLogger;

    constructor(
        private readonly files: FilesService,
        private readonly documentPrepare: DocumentPrepareService,
        @Inject(AppLoggerService) loggerFactory: AppLoggerService,
    ) {
        this.logger = loggerFactory.forContext(DocumentPrepareUploadListener.name);
    }

    onModuleInit(): void {
        this.files.onFileSaved((file) => {
            if (!routePreparedEngine(file)) return;

            void this.documentPrepare.enqueuePrepare(file.id!).catch((error) => {
                this.logger.error(
                    `Автоподготовка документа не удалась (fileId=${file.id})`,
                    error,
                    { fileId: file.id, detail: formatUnknown(error) },
                );
            });
        });
    }
}
