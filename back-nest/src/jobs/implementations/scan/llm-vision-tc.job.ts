import { Injectable } from '@nestjs/common';
import { ExtractionType } from '@miracle/types';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { FilesService } from '../../../files/files.service.js';
import { FilesContentService } from '../../../files-content/files-content.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';
import { ConvertService } from '../../../convert/convert.service.js';
import {
    TC_VISION_PROMPT,
    TC_VISION_USER,
    buildApplyJob,
    buildRecognizeJob,
    buildScanRun,
    visionRecognize,
    type ScanInput,
} from './scan.shared.js';

/** Корневой джоб распознавания PDF ТУ через LLM Vision (markdown). Дети: `recognize` → `apply`. */
@Injectable()
@JobImpl()
export class LlmVisionTcJob implements Job<ScanInput, void> {
    readonly id = brandJobId('llm-vision-tc');
    run!: Job<ScanInput, void>['run'];

    constructor(
        files: FilesService,
        filesContent: FilesContentService,
        yandex: YandexService,
        convert: ConvertService,
    ) {
        const recognize = visionRecognize(files, convert, yandex, TC_VISION_PROMPT, TC_VISION_USER);
        const recognizeJob = buildRecognizeJob('llm-vision-tc', recognize, filesContent, ExtractionType.LLM);
        const applyJob = buildApplyJob('llm-vision-tc', filesContent);
        this.run = buildScanRun(recognizeJob, applyJob, ExtractionType.LLM);
    }
}
