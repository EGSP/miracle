import { Injectable } from '@nestjs/common';
import { ExtractionType } from '@miracle/types';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { FilesService } from '../../../files/files.service.js';
import { FilesContentService } from '../../../files-content/files-content.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';
import { ConvertService } from '../../../convert/convert.service.js';
import {
    LLM_VISION_PROMPT,
    LLM_VISION_USER,
    buildApplyJob,
    buildRecognizeJob,
    buildScanRun,
    visionRecognize,
    type ScanInput,
} from './scan.shared.js';

/** Корневой джоб распознавания сложной вёрстки через LLM Vision. Дети: `recognize` → `apply`. */
@Injectable()
@JobImpl()
export class LlmVisionJob implements Job<ScanInput, void> {
    readonly id = brandJobId('llm-vision');
    run!: Job<ScanInput, void>['run'];

    constructor(
        files: FilesService,
        filesContent: FilesContentService,
        yandex: YandexService,
        convert: ConvertService,
    ) {
        const recognize = visionRecognize(files, convert, yandex, LLM_VISION_PROMPT, LLM_VISION_USER);
        const recognizeJob = buildRecognizeJob('llm-vision', recognize, filesContent, ExtractionType.LLM);
        const applyJob = buildApplyJob('llm-vision', filesContent);
        this.run = buildScanRun(recognizeJob, applyJob, ExtractionType.LLM);
    }
}
