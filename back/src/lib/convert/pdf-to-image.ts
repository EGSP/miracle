// legacy build не требует DOM API (DOMMatrix и др.) — обязателен для Node.js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PdfPageImage = {
    /** Номер страницы (начиная с 1) */
    page: number;
    /** JPEG в base64 — для вставки в API-запросы */
    base64: string;
    /** Готовый data URL для поля image_url промптов */
    dataUrl: string;
};

type PdfToImagesOptions = {
    /**
     * Масштаб рендеринга. Чем выше — тем чётче мелкие элементы (галочки, чекбоксы).
     * По умолчанию 2.0. Для сложных форм рекомендуется 3.0.
     */
    scale?: number;
    /** Качество JPEG: 0.0–1.0. По умолчанию 0.92. */
    quality?: number;
};

/**
 * Конвертирует PDF-буфер в массив JPEG-изображений (по одному на страницу).
 * Паттерн взят из официального примера pdfjs-dist/examples/node/pdf2png/pdf2png.mjs.
 *
 * @example
 * const images = await pdfToImages(buffer, { scale: 3.0 });
 * const content = [
 *     ...images.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } })),
 *     { type: 'text', text: 'Извлеки поля заказа...' },
 * ];
 */
export async function pdfToImages(
    pdfBuffer: Buffer,
    options: PdfToImagesOptions = {},
): Promise<PdfPageImage[]> {
    const { scale = 2.0, quality = 0.92 } = options;

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

    // canvasFactory берётся из документа — legacy build предоставляет Node.js реализацию.
    // Тип в d.ts — Object, поэтому кастуем к runtime-интерфейсу.
    const canvasFactory = doc.canvasFactory as unknown as NodeCanvasFactory;
    const pages: PdfPageImage[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

        // canvas: null — документировано: если передан canvasContext, canvas должен быть null.
        // RenderParameters типизирует canvas как required, но это расхождение с реальностью
        // (официальный пример node/pdf2png тоже не передаёт canvas).
        await page.render({
            canvas: null as unknown as HTMLCanvasElement,
            canvasContext: canvasAndContext.context,
            viewport,
        }).promise;

        page.cleanup();

        const { canvas } = canvasAndContext;
        const buffer = canvas.toBuffer('image/jpeg', { quality });
        const base64 = buffer.toString('base64');

        canvasFactory.destroy(canvasAndContext);

        pages.push({
            page: pageNum,
            base64,
            dataUrl: `data:image/jpeg;base64,${base64}`,
        });
    }

    await doc.destroy();

    return pages;
}
