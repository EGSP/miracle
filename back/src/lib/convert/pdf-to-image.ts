import { createCanvas, type Canvas } from 'canvas';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// В Node.js нет web-воркеров — pdf.js падает обратно на main thread
GlobalWorkerOptions.workerSrc = '';

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

type CanvasEntry = { canvas: Canvas };

// CanvasFactory — plain object, т.к. DocumentInitParameters.CanvasFactory типизирован как Object
const nodeCanvasFactory = {
    create(width: number, height: number): CanvasEntry {
        return { canvas: createCanvas(width, height) };
    },
    reset({ canvas }: CanvasEntry, width: number, height: number): void {
        canvas.width = width;
        canvas.height = height;
    },
    destroy({ canvas }: CanvasEntry): void {
        canvas.width = 0;
        canvas.height = 0;
    },
};

/**
 * Конвертирует PDF-буфер в массив JPEG-изображений (по одному на страницу).
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
        CanvasFactory: nodeCanvasFactory,
        disableFontFace: true,
        useSystemFonts: true,
    }).promise;

    const pages: PdfPageImage[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = createCanvas(viewport.width, viewport.height);

        await page.render({
            canvas: canvas as unknown as HTMLCanvasElement,
            viewport,
        }).promise;

        page.cleanup();

        const buffer = canvas.toBuffer('image/jpeg', { quality });
        const base64 = buffer.toString('base64');

        pages.push({
            page: pageNum,
            base64,
            dataUrl: `data:image/jpeg;base64,${base64}`,
        });
    }

    await doc.destroy();

    return pages;
}
