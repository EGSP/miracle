import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { formatUnknown, tryLabeledPromise } from '../../../../common/effect-errors.js';
import { FilesService } from '../../../../files/files.service.js';
import {
    LlmVisionExtractor,
    type VisionPageImage,
} from '../../../../document-prepare/adapters/llm-vision.extractor.js';
import type { ExtractError } from '../../../../document-prepare/extractor.port.js';

type VisionRenderInput = {
    readonly fileId: string;
};

type VisionRenderOutput = {
    readonly images: VisionPageImage[];
};

type VisionRenderMemo = {
    images?: VisionPageImage[];
};

/** JobTool: рендер страниц PDF / чтение изображения для LLM Vision. */
@Injectable()
export class VisionRenderTool
    implements JobTool<VisionRenderInput, VisionRenderOutput, VisionRenderMemo, ExtractError>
{
    readonly type = brandJobToolType('vision.render.v1');

    constructor(
        private readonly files: FilesService,
        private readonly extractor: LlmVisionExtractor,
    ) {}

    run = (input: VisionRenderInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<VisionRenderMemo>();
            const cached = yield* memo.get((m) => m.images);
            if (cached && cached.length > 0) {
                return { images: cached };
            }

            const file = yield* tryLabeledPromise(`загрузка файла "${input.fileId}"`, () =>
                this.files.get(input.fileId),
            ).pipe(
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

            yield* memo.set((m) => m.images, images);
            return { images };
        });
}
