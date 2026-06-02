import { Injectable } from '@nestjs/common';
import { ExtractionType } from '@miracle/types';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { FilesService } from '../../../files/files.service.js';
import { FilesContentService } from '../../../files-content/files-content.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';
import { buildApplyJob, buildRecognizeJob, buildScanRun, ocrRecognize, type ScanInput } from './scan.shared.js';

/** Корневой джоб OCR-распознавания (Yandex OCR). Дети: `recognize` → `apply`. */
@Injectable()
@JobImpl()
export class OcrJob implements Job<ScanInput, void> {
    readonly id = brandJobId('ocr');
    run!: Job<ScanInput, void>['run'];

    constructor(files: FilesService, filesContent: FilesContentService, yandex: YandexService) {
        const recognizeJob = buildRecognizeJob('ocr', ocrRecognize(files, yandex), filesContent, ExtractionType.OCR);
        const applyJob = buildApplyJob('ocr', filesContent);
        this.run = buildScanRun(recognizeJob, applyJob, ExtractionType.OCR);
    }
}
