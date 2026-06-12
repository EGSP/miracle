import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { formatUnknown } from '../../../../common/effect-errors.js';
import { FilesService } from '../../../../files/files.service.js';
import { LlmVisionExtractor } from '../../../../document-prepare/adapters/llm-vision.extractor.js';
import { ExtractError, yandexToExtractError } from '../../../../document-prepare/errors.js';
import type { PreparedResult } from '../../../../document-prepare/extractor.port.js';

type VisionExtractInput = { readonly fileId: string };

type VisionExtractMemo = {
    opId?: string;
    markdown?: string;
    meta?: Record<string, unknown>;
};

/**
 * JobTool: LLM Vision-подготовка с durable checkpoint.
 *
 * Шаги encapsulated в экстракторе; тул оркестрирует и сохраняет `opId` в ToolMemo ДО ожидания —
 * при рестарте job продолжает polling существующей операции, а не отправляет vision повторно.
 */
@Injectable()
export class VisionExtractTool
    implements JobTool<VisionExtractInput, PreparedResult, VisionExtractMemo, ExtractError>
{
    readonly type = brandJobToolType('document.extract.vision.v1');

    constructor(
        private readonly files: FilesService,
        private readonly extractor: LlmVisionExtractor,
    ) {}

    run = (input: VisionExtractInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<VisionExtractMemo>();

            const cachedMarkdown = yield* memo.get((m) => m.markdown);
            if (cachedMarkdown) {
                return { markdown: cachedMarkdown, meta: yield* memo.get((m) => m.meta) };
            }

            const file = yield* this.files.effects
                .require(input.fileId)
                .pipe(Effect.mapError((error) => new ExtractError({ message: formatUnknown(error) })));

            const images = yield* this.extractor.renderPages(file, this.files.getFilePath(file));

            let opId = yield* memo.get((m) => m.opId);
            if (!opId) {
                opId = yield* this.extractor
                    .submit(images)
                    .pipe(Effect.mapError((error) => yandexToExtractError(error, input.fileId)));
                yield* memo.set((m) => m.opId, opId);
            }

            const completed = yield* this.extractor
                .poll(opId)
                .pipe(Effect.mapError((error) => yandexToExtractError(error, input.fileId)));

            const result = this.extractor.toPreparedResult(completed, input.fileId, images.length);
            yield* memo.set((m) => m.markdown, result.markdown);
            if (result.meta) yield* memo.set((m) => m.meta, result.meta);

            return result;
        });
}
