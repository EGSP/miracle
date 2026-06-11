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
import { VisionRenderTool } from './tools/vision-render.tool.js';
import { VisionRecognizeTool } from './tools/vision-recognize.tool.js';

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
 * Фаза 2: kreuzberg; Фаза 3: llm-vision через JobTools.
 */
@Injectable()
@JobImpl()
export class PrepareDocumentJob implements Job<PrepareDocumentInput, void> {
    readonly id = brandJobId('prepare-document');
    run!: Job<PrepareDocumentInput, void>['run'];

    constructor(
        documentPrepare: DocumentPrepareService,
        kreuzbergExtractTool: KreuzbergExtractTool,
        visionRenderTool: VisionRenderTool,
        visionRecognizeTool: VisionRecognizeTool,
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

                const pipeline =
                    input.engine === 'kreuzberg'
                        ? Effect.gen(function* () {
                              yield* progress.push(0.1, { label: 'извлечение через kreuzberg' });
                              const result = yield* tools.run(kreuzbergExtractTool, { fileId: input.fileId });
                              yield* progress.push(0.8, { label: 'сохранение результата' });
                              yield* tools.run(prepareApplyTool, {
                                  preparedDocumentId: input.preparedDocumentId,
                                  result,
                              });
                          })
                        : Effect.gen(function* () {
                              yield* progress.push(0.05, { label: 'рендер страниц' });
                              const { images } = yield* tools.run(visionRenderTool, { fileId: input.fileId });
                              yield* progress.push(0.2, { label: 'распознавание через LLM Vision' });
                              const result = yield* tools.run(visionRecognizeTool, {
                                  fileId: input.fileId,
                                  images,
                              });
                              yield* progress.push(0.8, { label: 'сохранение результата' });
                              yield* tools.run(prepareApplyTool, {
                                  preparedDocumentId: input.preparedDocumentId,
                                  result,
                              });
                          });

                yield* pipeline.pipe(
                    Effect.catchAll((error) => markFailedAndFail(input.preparedDocumentId, error)),
                );

                yield* progress.push(1, { label: 'завершено' });
            });
    }
}
