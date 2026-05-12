import { ExtractionStatus, ExtractionType, getMimeType } from '@miracle/types';
import type { FileModel, Stored } from '@miracle/types';
import { filesContentService } from '../../databases/file-content.db.js';
import { workerPool } from '../../workers/worker-pool.js';
import { YandexOcrWorker } from '../../workers/yandex-ocr-worker.js';
import { LlmVisionWorker } from '../../workers/llm-vision-worker.js';

/**
 * MIME-типы, поддерживаемые Yandex OCR в асинхронном режиме.
 * Источник: документация Yandex Cloud ai-ocr-v1.
 */
const YANDEX_OCR_SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

type YandexOcrMimeType = (typeof YANDEX_OCR_SUPPORTED_MIME_TYPES)[number];

function isYandexOcrMimeType(mime: string): mime is YandexOcrMimeType {
    return (YANDEX_OCR_SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Запускает асинхронное OCR-распознавание для файлов домена VISUAL.
 */
export async function extractVisualContentWithOCR(dbFile: Stored<FileModel>): Promise<void> {
    const mimeType = getMimeType(dbFile.extension);

    if (!mimeType || !isYandexOcrMimeType(mimeType)) {
        throw new Error(
            `Расширение «${dbFile.extension}» не поддерживается Yandex OCR. ` +
            `Допустимые форматы: jpeg, png, pdf`,
        );
    }

    const fileContent = await filesContentService.create({
        fileId: dbFile.id,
        meta: {
            extractionType: ExtractionType.OCR,
            extractionStatus: ExtractionStatus.STARTED,
        },
    });

    const worker = new YandexOcrWorker({
        fileId: dbFile.id,
        fileContentId: fileContent.id,
        mimeType,
    });

    workerPool.launch(worker);
}

/**
 * Запускает LLM Vision извлечение для файлов со сложной структурой (чекбоксы, формы).
 * Использует мультимодальную LLM вместо OCR — лучше справляется с нестандартными элементами.
 */
export async function extractVisualContentWithLLM(dbFile: Stored<FileModel>): Promise<void> {
    const mimeType = getMimeType(dbFile.extension);

    if (!mimeType || !isYandexOcrMimeType(mimeType)) {
        throw new Error(
            `Расширение «${dbFile.extension}» не поддерживается LLM Vision. ` +
            `Допустимые форматы: jpeg, png, pdf`,
        );
    }

    const fileContent = await filesContentService.create({
        fileId: dbFile.id,
        meta: {
            extractionType: ExtractionType.LLM,
            extractionStatus: ExtractionStatus.STARTED,
        },
    });

    workerPool.launch(new LlmVisionWorker({
        fileId: dbFile.id,
        fileContentId: fileContent.id,
    }));
}
