import { Injectable } from '@nestjs/common';
import type { Effect } from 'effect';
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
import type { PreparedResult } from '../extractor.port.js';
import type { ExtractError } from '../errors.js';
import { LLM_VISION_PROMPT, LLM_VISION_USER } from '../vision/prompts.js';
import { renderVisionPages, type VisionPageImage } from '../vision/render-pages.js';

export type { VisionPageImage } from '../vision/render-pages.js';

/**
 * I/O-сервис LLM Vision: гранулярные шаги (рендер → submit → poll → сборка результата).
 *
 * Монолитного `extract()` намеренно нет: durable-оркестрацию (checkpoint `opId` в ToolMemo между
 * submit и poll) выполняет `VisionExtractTool`. Сервис лишь знает, КАК говорить с Yandex.
 */
@Injectable()
export class LlmVisionExtractor {
    constructor(
        private readonly convert: ConvertService,
        private readonly yandex: YandexService,
    ) {}

    /** Рендер страниц PDF или чтение изображения jpg/png. */
    renderPages(file: FileModel, filePath: string): Effect.Effect<VisionPageImage[], ExtractError> {
        return renderVisionPages(this.convert, file, filePath);
    }

    /** Отправляет фоновую vision-операцию, возвращает её `opId`. */
    submit(images: ReadonlyArray<VisionPageImage>): Effect.Effect<string, YandexError> {
        return this.yandex.createResponse(this.buildCreateRequest(images));
    }

    /** Ожидает завершения фоновой операции (единый источник правды — {@link YandexService.poll}). */
    poll(opId: string): Effect.Effect<YandexCompletedResponse, YandexError> {
        return this.yandex.poll(opId);
    }

    /** Преобразует завершённый ответ Yandex в {@link PreparedResult}. */
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

    /** Параметры createResponse для vision-распознавания. */
    private buildCreateRequest(images: ReadonlyArray<VisionPageImage>): YandexCreateResponseRequest {
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
}
