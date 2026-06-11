import fs from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { Duration, Effect } from 'effect';
import { validatePageRanges, type FileModel } from '@miracle/types';
import { formatUnknown, tryLabeledPromise } from '../../common/effect-errors.js';
import { ConvertService } from '../../convert/convert.service.js';
import {
    LLM_VISION_PROMPT,
    LLM_VISION_USER,
} from '../../jobs/implementations/scan/scan.shared.js';
import {
    YANDEX_MODELS,
    YandexInput,
    YandexService,
    type YandexCompletedResponse,
    type YandexCreateResponseRequest,
    type YandexError,
} from '../../yandex/yandex.service.js';
import type { DocumentExtractor, ExtractError, PreparedResult } from '../extractor.port.js';

/** Страница документа для LLM Vision (PdfPageImage-совместимый тип). */
export type VisionPageImage = {
    readonly page: number;
    readonly base64: string;
    readonly dataUrl: string;
};

const extractError = (message: string): ExtractError => ({ _tag: 'ExtractError', message });

const isExtractError = (error: unknown): error is ExtractError =>
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    (error as ExtractError)._tag === 'ExtractError';

/** Преобразует ошибку Yandex в ExtractError для границы job. */
export const yandexToExtractError = (error: YandexError, fileId: string): ExtractError => ({
    _tag: 'ExtractError',
    message: `Не удалось распознать файл "${fileId}" через Vision: ${error.message}`,
});

/** HTTP/LLM-адаптер: рендер страниц + распознавание через Yandex Vision. */
@Injectable()
export class LlmVisionExtractor implements DocumentExtractor {
    readonly engine = 'llm-vision' as const;

    constructor(
        private readonly convert: ConvertService,
        private readonly yandex: YandexService,
    ) {}

    /** Рендер страниц PDF или чтение изображения jpg/png. */
    renderPages(file: FileModel, filePath: string): Effect.Effect<VisionPageImage[], ExtractError> {
        return Effect.gen(this, function* () {
            const ext = file.extension.toLowerCase();
            if (ext === 'pdf') {
                const buffer = yield* tryLabeledPromise(`чтение PDF-файла "${file.id}"`, () =>
                    fs.readFile(filePath),
                ).pipe(
                    Effect.mapError((error) => extractError(formatUnknown(error))),
                );
                const spec = file.settings?.usedPages?.trim();
                let pageNumbers: number[] | undefined;
                if (spec) {
                    const result = validatePageRanges(spec);
                    if (!result.ok) {
                        return yield* Effect.fail(
                            extractError(`Настройка usedPages: ${result.message}`),
                        );
                    }
                    pageNumbers = result.pages;
                }
                return yield* tryLabeledPromise(`рендеринг страниц PDF файла "${file.id}"`, () =>
                    this.convert.pdfToImages(buffer, { scale: 2.5, pageNumbers }),
                ).pipe(
                    Effect.mapError((error) => extractError(formatUnknown(error))),
                );
            }

            const buffer = yield* tryLabeledPromise(`чтение файла изображения "${file.id}"`, () =>
                fs.readFile(filePath),
            ).pipe(
                Effect.mapError((error) => extractError(formatUnknown(error))),
            );
            const base64 = buffer.toString('base64');
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
            return [{ page: 1, base64, dataUrl: `data:${mimeType};base64,${base64}` }];
        });
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

    /** Системный и пользовательский промпты (для ToolMemo checkpoint). */
    getFinalPrompt(): { readonly system: string; readonly user: string } {
        return { system: LLM_VISION_PROMPT, user: LLM_VISION_USER };
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

    /** Полный цикл create→poll без durable memo (для прямого вызова extract). */
    recognize(
        images: ReadonlyArray<VisionPageImage>,
        fileId: string,
    ): Effect.Effect<PreparedResult, ExtractError> {
        return Effect.gen(this, function* () {
            const opId = yield* this.yandex.createResponse(this.buildCreateRequest(images));
            const completed = yield* this.pollUntilDone(opId);
            return this.toPreparedResult(completed, fileId, images.length);
        }).pipe(
            Effect.mapError((error): ExtractError =>
                isExtractError(error) ? error : yandexToExtractError(error as YandexError, fileId),
            ),
        );
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

    private pollUntilDone(opId: string): Effect.Effect<YandexCompletedResponse, YandexError> {
        return Effect.gen(this, function* () {
            while (true) {
                const poll = yield* this.yandex.retrieveResponse(opId);
                if (poll.done) {
                    return poll;
                }
                yield* Effect.sleep(Duration.millis(3000));
            }
        });
    }

    extract(file: FileModel, filePath: string): Effect.Effect<PreparedResult, ExtractError> {
        return Effect.gen(this, function* () {
            const images = yield* this.renderPages(file, filePath);
            return yield* this.recognize(images, file.id);
        });
    }
}
