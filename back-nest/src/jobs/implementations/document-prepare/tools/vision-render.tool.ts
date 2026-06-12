import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { formatUnknown } from '../../../../common/effect-errors.js';
import { FilesService } from '../../../../files/files.service.js';
import { LlmVisionExtractor } from '../../../../document-prepare/adapters/llm-vision.extractor.js';
import type { ExtractError } from '../../../../document-prepare/extractor.port.js';
import type { VisionPageImage } from '../../../../document-prepare/vision/render-pages.js';

type VisionRenderInput = {
    readonly fileId: string;
};

type VisionRenderOutput = {
    readonly images: VisionPageImage[];
};

/**
 * JobTool: рендер страниц PDF / чтение изображения для LLM Vision.
 *
 * Массив `images` не кэшируется в ToolMemo: re-render при resume render-шага дешевле по рискам,
 * чем хранить base64 многостраничного PDF в `job_runs.memo`.
 */
@Injectable()
export class VisionRenderTool
    implements JobTool<VisionRenderInput, VisionRenderOutput, ToolMemo.Model, ExtractError>
{
    readonly type = brandJobToolType('vision.render.v1');

    constructor(
        private readonly files: FilesService,
        private readonly extractor: LlmVisionExtractor,
    ) {}

    run = (input: VisionRenderInput) =>
        Effect.gen(this, function* () {
            const file = yield* this.files.effects.get(input.fileId).pipe(
                Effect.mapError(
                    (error): ExtractError => ({
                        _tag: 'ExtractError',
                        message: formatUnknown(error),
                    }),
                ),
            );
            if (!file) {
                return yield* Effect.fail({
                    _tag: 'ExtractError',
                    message: `Файл "${input.fileId}" не найден`,
                } satisfies ExtractError);
            }

            const filePath = this.files.getFilePath(file);
            const images = yield* this.extractor.renderPages(file, filePath);
            return { images };
        });
}
