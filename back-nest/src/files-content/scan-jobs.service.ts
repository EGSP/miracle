import { Injectable, type OnModuleInit } from '@nestjs/common';
import { registerJob } from '../jobs/registry.js';
import type { AnyJob } from '../jobs/job.js';
import { FilesService } from '../files/files.service.js';
import { YandexService } from '../yandex/yandex.service.js';
import { ConvertService } from '../convert/convert.service.js';
import { FilesContentService } from './files-content.service.js';
import { createScanJobs } from './scan-jobs.js';

/**
 * Строит scan-джобы (замыкая сервисы — фабрика DI) и регистрирует их корневые определения в реестре
 * (нужно для восстановления прогонов). `ExtractionService` берёт отсюда нужный джоб для запуска.
 */
@Injectable()
export class ScanJobs implements OnModuleInit {
    readonly ocr: AnyJob;
    readonly llmVision: AnyJob;
    readonly llmVisionTc: AnyJob;

    constructor(
        files: FilesService,
        filesContent: FilesContentService,
        yandex: YandexService,
        convert: ConvertService,
    ) {
        const jobs = createScanJobs({ files, filesContent, yandex, convert });
        this.ocr = jobs.ocr;
        this.llmVision = jobs.llmVision;
        this.llmVisionTc = jobs.llmVisionTc;
    }

    onModuleInit(): void {
        registerJob(this.ocr);
        registerJob(this.llmVision);
        registerJob(this.llmVisionTc);
    }
}
