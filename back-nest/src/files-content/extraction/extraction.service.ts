import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
    ExtractionStatus,
    ExtractionType,
    FileDomain,
    getFileDomain,
    type FileContent,
    type FileModel,
    type Stored,
} from '@miracle/types';
import { FilesService } from '../../files/files.service.js';
import { AppLoggerService, type AppLogger } from '../../logger/app-logger.service.js';
import { JobsService } from '../../jobs/jobs.service.js';
import { FilesContentService } from '../files-content.service.js';
import { ScanJobs } from '../scan-jobs.service.js';
import { extractDocumentContent } from './extract-document.js';
import { extractSpreadsheetContent } from './extract-spreadsheet.js';
import { extractTextContent } from './extract-text.js';

type ContentGenerator = (
    dbFile: Stored<FileModel>,
    filePath: string,
) => AsyncGenerator<Omit<FileContent, 'id'>, void, void>;

/**
 * Оркестрация извлечения содержимого файла: определить домен, запустить нужный экстрактор,
 * записать результат через {@link FilesContentService}.
 *
 * Generator-путь (DOCUMENT/SPREADSHEET/TEXT) реализован. VISUAL (OCR/LLM Vision) тянет
 * worker-runtime + scan-воркеры + `yandex`/`convert` — отложен на слой 4.
 */
@Injectable()
export class ExtractionService {
    private readonly logger: AppLogger;

    constructor(
        private readonly files: FilesService,
        private readonly filesContent: FilesContentService,
        private readonly runtime: JobsService,
        private readonly scanJobs: ScanJobs,
        @Inject(AppLoggerService) private readonly loggerFactory: AppLoggerService,
    ) {
        this.logger = this.loggerFactory.forContext(ExtractionService.name);
    }

    /**
     * Гейт «уже извлечено / повтор после ошибки» + запуск извлечения.
     * @throws BadRequestException если контент уже извлечён (и повтор не запрошен/не применим).
     */
    async extract(fileId: string, options?: { retryIfLastFailed?: boolean }): Promise<void> {
        const others = await this.filesContent.getContent(fileId);
        if (others.length > 0) {
            const last = others[0];
            if (options?.retryIfLastFailed === true && last?.meta?.extractionStatus === ExtractionStatus.FAILED) {
                this.logger.info('Повторная попытка извлечения после ошибки', { fileId });
                await this.runExtraction(fileId);
                return;
            }
            throw new BadRequestException('Содержимое файла уже извлечено');
        }

        await this.runExtraction(fileId);
    }

    private async runExtraction(fileId: string): Promise<void> {
        const file = await this.files.get(fileId);
        if (!file) {
            throw new NotFoundException('Файл не найден');
        }

        const domain = getFileDomain(file.extension!);
        if (!domain) {
            throw new BadRequestException(`Тип файла с расширением «${file.extension}» не поддерживается`);
        }

        // Защита от дублирующего запуска: если уже идёт извлечение — выходим без действий.
        const existingContent = await this.filesContent.getContent(fileId);
        const alreadyInProgress = existingContent.some(
            (c) => c.deletedAt == null && c.meta?.extractionStatus === ExtractionStatus.STARTED,
        );
        if (alreadyInProgress) {
            return;
        }

        if (domain === FileDomain.VISUAL) {
            const useLlm = Boolean(file.settings?.isTechnicalCondition || file.settings?.complexLayout);
            const extractionType = useLlm ? ExtractionType.LLM : ExtractionType.OCR;
            const record = await this.filesContent.create({
                fileId,
                meta: { extractionType, extractionStatus: ExtractionStatus.STARTED },
            });
            const job = file.settings?.isTechnicalCondition
                ? this.scanJobs.llmVisionTc
                : file.settings?.complexLayout
                  ? this.scanJobs.llmVision
                  : this.scanJobs.ocr;
            await this.runtime.start(job, { fileId, fileContentId: record.id });
            return;
        }

        const extractor = this.pickGeneratorExtractor(domain);
        if (!extractor) {
            return;
        }

        const pathToFile = this.files.getFilePath(file);

        let created: Stored<FileContent> | undefined;
        for await (const content of extractor(file, pathToFile)) {
            if (!created) {
                created = await this.filesContent.create(content);
            } else {
                created = (await this.filesContent.update({ id: created.id, ...content })) ?? undefined;
            }
        }
    }

    private pickGeneratorExtractor(domain: FileDomain): ContentGenerator | undefined {
        switch (domain) {
            case FileDomain.DOCUMENT:
                return extractDocumentContent;
            case FileDomain.SPREADSHEET:
                return extractSpreadsheetContent;
            case FileDomain.TEXT:
                return extractTextContent;
            default:
                return undefined;
        }
    }
}
