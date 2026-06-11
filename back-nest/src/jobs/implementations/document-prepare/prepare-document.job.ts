import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import type { PreparedEngine } from '../../../document-prepare/extractor.port.js';
import { DocumentPrepareService } from '../../../document-prepare/document-prepare.service.js';

const DPS_NOT_IMPLEMENTED = 'DPS extractor is not implemented yet';

export type PrepareDocumentInput = {
    fileId: string;
    preparedDocumentId: string;
    engine: PreparedEngine;
};

/**
 * Корневая джоба подготовки документа (Фаза 1 — safe stub).
 * Фазы 2/3 заменят stub на JobTools (kreuzberg.extract.v1, vision.*, prepare.apply.v1);
 * диспетчеризация по `input.engine` — внутри одного JobRun.
 */
@Injectable()
@JobImpl()
export class PrepareDocumentJob implements Job<PrepareDocumentInput, void> {
    readonly id = brandJobId('prepare-document');
    run!: Job<PrepareDocumentInput, void>['run'];

    constructor(documentPrepare: DocumentPrepareService) {
        this.run = (input) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                yield* tryLabeledPromise('mark running', () =>
                    documentPrepare.markRunning(input.preparedDocumentId, jobs.runId),
                );
                yield* tryLabeledPromise('mark failed', () =>
                    documentPrepare.markFailed(input.preparedDocumentId, DPS_NOT_IMPLEMENTED),
                );
                return yield* Effect.fail(new Error(DPS_NOT_IMPLEMENTED));
            });
    }
}
