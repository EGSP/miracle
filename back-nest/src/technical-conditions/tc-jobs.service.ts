import { Injectable, type OnModuleInit } from '@nestjs/common';
import { registerJob } from '../jobs/registry.js';
import type { AnyJob } from '../jobs/job.js';
import { YandexService } from '../yandex/yandex.service.js';
import { FilesContentService } from '../files-content/files-content.service.js';
import { TechnicalConditionsService } from './technical-conditions.service.js';
import { createTcJobs } from './tc-jobs.js';

/** Строит и регистрирует джоб `tc-extract` (замыкание сервисов — фабрика DI). */
@Injectable()
export class TcJobs implements OnModuleInit {
    readonly tcExtract: AnyJob;

    constructor(
        tc: TechnicalConditionsService,
        filesContent: FilesContentService,
        yandex: YandexService,
    ) {
        this.tcExtract = createTcJobs({ tc, filesContent, yandex }).tcExtract;
    }

    onModuleInit(): void {
        registerJob(this.tcExtract);
    }
}
