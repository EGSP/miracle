import { Injectable } from '@nestjs/common';
import { Duration, Effect } from 'effect';
import type { FileModel } from '@miracle/types';
import { ConvertService } from '../../convert/convert.service.js';
import {
    YANDEX_MODELS,
    YandexInput,
    YandexService,
    type YandexCompletedResponse,
    type YandexCreateResponseRequest,
    type YandexError,
} from '../../yandex/yandex.service.js';
import type { DocumentExtractor, ExtractError, PreparedResult } from '../extractor.port.js';
import { yandexToExtractError } from '../errors.js';
import { LLM_VISION_PROMPT, LLM_VISION_USER } from '../vision/prompts.js';
import {
    renderVisionPages,
    type VisionPageImage,
} from '../vision/render-pages.js';

export type { VisionPageImage } from '../vision/render-pages.js';

const POLL_INTERVAL_MS = 3000;

/** HTTP/LLM-адаптер: рендер страниц + распознавание через Yandex Vision. */
@Injectable()
export class LlmVisionExtractor implements DocumentExtractor {
    readonly engine = 'llm-vision' as const;

    constructor(
        private readonly convert: ConvertService,
        private readonly yandex: YandexService,
    ) {}

    extract(file: FileModel, filePath: string): Effect.Effect<PreparedResult, ExtractError> {
        const fileId = file.id ?? filePath;
        return Effect.gen(this, function* () {
            const images = yield* this.renderPages(file, filePath);
            const opId = yield* this.submit(images).pipe(
                Effect.mapError((error) => yandexToExtractError(error, fileId)),
            );
            const completed = yield* this.pollUntilDone(opId, fileId);
            return this.toPreparedResult(completed, fileId, images.length);
        });
    }

    /** Рендер страниц PDF или чтение изображения jpg/png. */
    renderPages(file: FileModel, filePath: string): Effect.Effect<VisionPageImage[], ExtractError> {
        return renderVisionPages(this.convert, file, filePath);
    }

    /** Параметры createResponse для vision-распознавания. */
    buildCreateRequest(images: ReadonlyArray<VisionPageImage>): YandexCreateResponseRequest {
        return {
            model: YANDEX_MODELS.vision,
            instructions: LLM_VISION_PROMPT,
            input: [
                YandexInput.user([
                    ...images.map((page) => YandexInput.imageDataUrl(page.dataUrl)),
                    YandexInput.text(LLM_VISION_USER),
                ]),
            ],
            maxOutputTokens: 40000,
        };
    }

    /** Преобразует завершённый ответ Yandex в PreparedResult. */
    toPreparedResult(
        completed: YandexCompletedResponse,
        fileId: string,
        pageCount: number,
    ): PreparedResult {
        const meta: Record<string, unknown> = {
            source: 'llm-vision',
            model: YANDEX_MODELS.vision,
            fileId,
            pageCount,
        };
        if (completed.response.usage) {
            meta.usage = completed.response.usage;
        }
        return {
            markdown: completed.outputText,
            meta,
        };
    }

    /** Один poll-шаг для ToolMemo-оркестрации. */
    pollOnce(opId: string): Effect.Effect<
        { readonly done: false } | YandexCompletedResponse,
        YandexError
    > {
        return this.yandex.retrieveResponse(opId).pipe(
            Effect.map((poll) => (poll.done ? poll : { done: false as const })),
        );
    }

    /** Submit для ToolMemo-оркестрации. */
    submit(images: ReadonlyArray<VisionPageImage>): Effect.Effect<string, YandexError> {
        return this.yandex.createResponse(this.buildCreateRequest(images));
    }

    private pollUntilDone(
        opId: string,
        fileId: string,
    ): Effect.Effect<YandexCompletedResponse, ExtractError> {
        return Effect.gen(this, function* () {
            while (true) {
                const poll = yield* this.pollOnce(opId).pipe(
                    Effect.mapError((error) => yandexToExtractError(error, fileId)),
                );
                if (poll.done === true) {
                    return poll;
                }
                yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
            }
        });
    }
}
