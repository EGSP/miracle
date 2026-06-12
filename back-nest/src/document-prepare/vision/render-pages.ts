import fs from 'fs/promises';
import { Effect } from 'effect';
import { validatePageRanges, type FileModel } from '@miracle/types';
import { formatUnknown, tryLabeledPromise } from '../../common/effect-errors.js';
import type { ConvertService } from '../../convert/convert.service.js';
import type { ExtractError } from '../extractor.port.js';
import { extractError } from '../errors.js';

/** Страница документа для LLM Vision (PdfPageImage-совместимый тип). */
export type VisionPageImage = {
    readonly page: number;
    readonly base64: string;
    readonly dataUrl: string;
};

type ConvertDep = Pick<ConvertService, 'pdfToImages'>;

/** Рендер страниц PDF или чтение изображения jpg/png для LLM Vision. */
export const renderVisionPages = (
    convert: ConvertDep,
    file: FileModel,
    filePath: string,
): Effect.Effect<VisionPageImage[], ExtractError> =>
    Effect.gen(function* () {
        const ext = file.extension.toLowerCase();
        if (ext === 'pdf') {
            const buffer = yield* tryLabeledPromise(`чтение PDF-файла "${file.id}"`, () =>
                fs.readFile(filePath),
            ).pipe(Effect.mapError((error) => extractError(formatUnknown(error))));
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
                convert.pdfToImages(buffer, { scale: 2.5, pageNumbers }),
            ).pipe(Effect.mapError((error) => extractError(formatUnknown(error))));
        }

        const buffer = yield* tryLabeledPromise(`чтение файла изображения "${file.id}"`, () =>
            fs.readFile(filePath),
        ).pipe(Effect.mapError((error) => extractError(formatUnknown(error))));
        const base64 = buffer.toString('base64');
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        return [{ page: 1, base64, dataUrl: `data:${mimeType};base64,${base64}` }];
    });
