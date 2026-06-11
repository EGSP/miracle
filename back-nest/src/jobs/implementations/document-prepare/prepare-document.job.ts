import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { JobTools, Jobs, Progress } from '../../framework/context.js';
import { formatUnknown, tryLabeledPromise } from '../../../common/effect-errors.js';
import type { ExtractError, PreparedEngine } from '../../../document-prepare/extractor.port.js';
import { DocumentPrepareService } from '../../../document-prepare/document-prepare.service.js';
import { KreuzbergExtractTool } from './tools/kreuzberg-extract.tool.js';
import { PrepareApplyTool } from './tools/prepare-apply.tool.js';

const LLM_VISION_NOT_IMPLEMENTED = 'DPS LLM Vision extractor is not implemented yet';

export type PrepareDocumentInput = {
    fileId: string;
    preparedDocumentId: string;
    engine: PreparedEngine;
};

const formatJobError = (error: unknown): string => {
    if (error && typeof error === 'object' && '_tag' in error && (error as ExtractError)._tag === 'ExtractError') {
        return (error as ExtractError).message;
    }
    return formatUnknown(error);
};

/**
 * Корневая джоба подготовки документа.
 * Фаза 2: ветка kreuzberg через JobTools; llm-vision — stub до Фазы 3.
 */
@Injectable()
@JobImpl()
export class PrepareDocumentJob implements Job<PrepareDocumentInput, void> {
    readonly id = brandJobId('prepare-document');
    run!: Job<PrepareDocumentInput, void>['run'];

    constructor(
        documentPrepare: DocumentPrepareService,
        kreuzbergExtractTool: KreuzbergExtractTool,
        prepareApplyTool: PrepareApplyTool,
    ) {
        const markFailedAndFail = (preparedDocumentId: string, error: unknown) =>
            Effect.gen(function* () {
                const message = formatJobError(error);
                yield* tryLabeledPromise('mark failed', () => documentPrepare.markFailed(preparedDocumentId, message));
                return yield* Effect.fail(error instanceof Error ? error : new Error(message));
            });

        this.run = (input) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const tools = yield* JobTools;
                const progress = yield* Progress;

                yield* progress.push(0, { label: 'подготовка документа' });
                yield* tryLabeledPromise('mark running', () =>
                    documentPrepare.markRunning(input.preparedDocumentId, jobs.runId),
                );

                if (input.engine === 'kreuzberg') {
                    const pipeline = Effect.gen(function* () {
                        yield* progress.push(0.1, { label: 'извлечение через kreuzberg' });
                        const result = yield* tools.run(kreuzbergExtractTool, { fileId: input.fileId });
                        yield* progress.push(0.8, { label: 'сохранение результата' });
                        yield* tools.run(prepareApplyTool, {
                            preparedDocumentId: input.preparedDocumentId,
                            result,
                        });
                    });

                    yield* pipeline.pipe(
                        Effect.catchAll((error) => markFailedAndFail(input.preparedDocumentId, error)),
                    );
                } else {
                    yield* tryLabeledPromise('mark failed', () =>
                        documentPrepare.markFailed(input.preparedDocumentId, LLM_VISION_NOT_IMPLEMENTED),
                    );
                    return yield* Effect.fail(new Error(LLM_VISION_NOT_IMPLEMENTED));
                }

                yield* progress.push(1, { label: 'завершено' });
            });
    }
}
