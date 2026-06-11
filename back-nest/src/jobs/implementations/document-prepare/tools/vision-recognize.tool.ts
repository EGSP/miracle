import { Injectable } from '@nestjs/common';
import { Duration, Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import {
    LlmVisionExtractor,
    yandexToExtractError,
    type VisionPageImage,
} from '../../../../document-prepare/adapters/llm-vision.extractor.js';
import type { ExtractError, PreparedResult } from '../../../../document-prepare/extractor.port.js';
import type { YandexCompletedResponse } from '../../../../yandex/yandex.service.js';

type VisionRecognizeInput = {
    readonly fileId: string;
    readonly images: ReadonlyArray<VisionPageImage>;
};

type VisionRecognizeMemo = {
    opId?: string;
    finalPrompt?: { system: string; user: string };
    yandexResponse?: unknown;
    markdown?: string;
    meta?: Record<string, unknown>;
};

const POLL_INTERVAL_MS = 3000;

/** JobTool: LLM Vision submit→poll с durable checkpoint в ToolMemo. */
@Injectable()
export class VisionRecognizeTool
    implements JobTool<VisionRecognizeInput, PreparedResult, VisionRecognizeMemo, ExtractError>
{
    readonly type = brandJobToolType('vision.recognize.v1');

    constructor(private readonly extractor: LlmVisionExtractor) {}

    run = (input: VisionRecognizeInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<VisionRecognizeMemo>();

            const cachedMarkdown = yield* memo.get((m) => m.markdown);
            if (cachedMarkdown) {
                const meta = yield* memo.get((m) => m.meta);
                return { markdown: cachedMarkdown, meta };
            }

            let opId = yield* memo.get((m) => m.opId);
            if (!opId) {
                opId = yield* this.extractor.submit(input.images).pipe(
                    Effect.mapError((error) => yandexToExtractError(error, input.fileId)),
                );
                yield* memo.set((m) => m.opId, opId);
                yield* memo.set((m) => m.finalPrompt, this.extractor.getFinalPrompt());
            }

            const completed = yield* this.pollUntilDone(opId, input.fileId);
            yield* memo.set((m) => m.yandexResponse, completed.response);

            const result = this.extractor.toPreparedResult(
                completed,
                input.fileId,
                input.images.length,
            );
            yield* memo.set((m) => m.markdown, result.markdown);
            if (result.meta) {
                yield* memo.set((m) => m.meta, result.meta);
            }

            return result;
        });

    private pollUntilDone(
        opId: string,
        fileId: string,
    ): Effect.Effect<YandexCompletedResponse, ExtractError> {
        return Effect.gen(this, function* () {
            while (true) {
                const poll = yield* this.extractor.pollOnce(opId).pipe(
                    Effect.mapError((error) => yandexToExtractError(error, fileId)),
                );
                if ('outputText' in poll) {
                    return poll;
                }
                yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
            }
        });
    }
}
