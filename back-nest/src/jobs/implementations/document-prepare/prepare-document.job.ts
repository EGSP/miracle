import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { JobTools, Jobs, Progress } from '../../framework/context.js';
import type { ToolMemo } from '../../framework/context.js';
import type { JobTool } from '../../framework/job-tool.js';
import { formatUnknown, tryLabeledPromise } from '../../../common/effect-errors.js';
import { ExtractError } from '../../../document-prepare/errors.js';
import type { PreparedEngine, PreparedResult } from '../../../document-prepare/extractor.port.js';
import { DocumentPrepareService } from '../../../document-prepare/document-prepare.service.js';
import { KreuzbergExtractTool } from './tools/kreuzberg-extract.tool.js';
import { VisionExtractTool } from './tools/vision-extract.tool.js';
import { PrepareApplyTool } from './tools/prepare-apply.tool.js';

export type PrepareDocumentInput = {
    fileId: string;
    engine: PreparedEngine;
};

/** Тул извлечения, унифицированный по входу/выходу для диспетчеризации по движку. */
type ExtractTool = JobTool<{ readonly fileId: string }, PreparedResult, ToolMemo.Model, ExtractError>;

const formatJobError = (error: unknown): string =>
    error instanceof ExtractError ? error.message : formatUnknown(error);

/**
 * Корневая джоба подготовки документа.
 *
 * Оркестрация engine-agnostic: по {@link PreparedEngine} выбирается тул извлечения (kreuzberg /
 * vision), который сам приводит файл к markdown; затем apply-тул сохраняет результат. Джоба не
 * знает внутренней механики движков — только сопоставление `engine → тул`.
 */
@Injectable()
@JobImpl()
export class PrepareDocumentJob implements Job<PrepareDocumentInput, void> {
    readonly id = brandJobId('prepare-document');
    run!: Job<PrepareDocumentInput, void>['run'];

    constructor(
        documentPrepare: DocumentPrepareService,
        kreuzbergExtractTool: KreuzbergExtractTool,
        visionExtractTool: VisionExtractTool,
        prepareApplyTool: PrepareApplyTool,
    ) {
        const extractTools: Record<PreparedEngine, ExtractTool> = {
            kreuzberg: kreuzbergExtractTool,
            'llm-vision': visionExtractTool,
        };

        const markFailedAndFail = (fileId: string, error: unknown) =>
            Effect.gen(function* () {
                const message = formatJobError(error);
                yield* tryLabeledPromise('отметка проваленной подготовки', () =>
                    documentPrepare.markFailed(fileId, message),
                );
                return yield* Effect.fail(error instanceof Error ? error : new Error(message));
            });

        this.run = (input) =>
            Effect.gen(function* () {
                if (input.engine === 'llm-vision') {
                    return yield* Effect.fail(new Error('LLM Vision is not supported yet'));
                }

                const jobs = yield* Jobs;
                const tools = yield* JobTools;
                const progress = yield* Progress;

                yield* progress.push(0, { label: 'подготовка документа' });
                yield* tryLabeledPromise('отметка запущенной подготовки', () =>
                    documentPrepare.markRunning(input.fileId, jobs.runId),
                );

                yield* progress.push(0.1, { label: 'извлечение содержимого' });
                const result = yield* tools.run(extractTools[input.engine], { fileId: input.fileId });

                yield* progress.push(0.8, { label: 'сохранение результата' });
                yield* tools.run(prepareApplyTool, { fileId: input.fileId, result });

                yield* progress.push(1, { label: 'завершено' });
            }).pipe(
                // Любая ошибка генератора (включая guard и шаги до/после извлечения) → PreparedDocument
                // помечается failed, ошибка пробрасывается дальше → JobRun тоже failed.
                Effect.catchAll((error) => markFailedAndFail(input.fileId, error)),
            );
    }
}
