import { Injectable } from '@nestjs/common';
// legacy build не требует DOM API (DOMMatrix и др.) — обязателен для Node.js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PdfPageImage = {
    /** Номер страницы (с 1). */
    page: number;
    /** JPEG в base64. */
    base64: string;
    /** data URL для поля image_url промптов. */
    dataUrl: string;
};

export type PdfToImagesOptions = {
    /** Масштаб рендеринга. Выше — чётче мелкие элементы. По умолчанию 2.0. */
    scale?: number;
    /** Качество JPEG 0.0–1.0. По умолчанию 0.92. */
    quality?: number;
    /** Номера страниц (1-based). Не задан — все. */
    pageNumbers?: number[];
};

/**
 * `@Global` вендор-обёртка над pdfjs (порт back/src/lib/convert/pdf-to-image.ts):
 * конвертирует PDF-буфер в JPEG-изображения постранично.
 */
@Injectable()
export class ConvertService {
    async pdfToImages(pdfBuffer: Buffer, options: PdfToImagesOptions = {}): Promise<PdfPageImage[]> {
        const { scale = 2.0, quality = 0.92, pageNumbers } = options;
        const pageSet = pageNumbers ? new Set(pageNumbers) : null;

        const doc = await getDocument({
            data: new Uint8Array(pdfBuffer),
            disableFontFace: true,
            useSystemFonts: true,
        }).promise;

        type NodeCanvas = { toBuffer(format: string, options?: { quality?: number }): Buffer };
        type CanvasAndContext = { canvas: NodeCanvas; context: CanvasRenderingContext2D };
        type NodeCanvasFactory = {
            create(w: number, h: number): CanvasAndContext;
            destroy(cc: CanvasAndContext): void;
        };

        const canvasFactory = doc.canvasFactory as unknown as NodeCanvasFactory;
        const pages: PdfPageImage[] = [];

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
            if (pageSet && !pageSet.has(pageNum)) continue;
            const page = await doc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

            await page.render({
                // canvas: null документировано: при canvasContext передаётся null (расхождение с типами).
                canvas: null as unknown as HTMLCanvasElement,
                canvasContext: canvasAndContext.context,
                viewport,
            }).promise;

            page.cleanup();

            const { canvas } = canvasAndContext;
            const buffer = canvas.toBuffer('image/jpeg', { quality });
            const base64 = buffer.toString('base64');

            canvasFactory.destroy(canvasAndContext);

            pages.push({ page: pageNum, base64, dataUrl: `data:image/jpeg;base64,${base64}` });
        }

        await doc.destroy();
        return pages;
    }
}
