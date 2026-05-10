import { ExtractionStatus, ExtractionType, getMimeType } from '@miracle/types';
import type { FileModel, Stored } from '@miracle/types';
import { filesContentService } from '../../databases/file-content.db.js';
import { workerPool } from '../../workers/worker-pool.js';
import { YandexOcrWorker } from '../../workers/yandex-ocr-worker.js';

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
 *
 * В отличие от других экстракторов, функция не является генератором:
 * она создаёт стартовую запись FileContent, запускает YandexOcrWorker
 * в фоне и немедленно возвращает управление.
 *
 * Результат распознавания появится в FileContent позже —
 * когда воркер получит ответ от Yandex Cloud.
 *
 * @param dbFile  Запись файла из БД.
 */
export async function extractVisualContent(
    dbFile: Stored<FileModel>,
): Promise<void> {
    const mimeType = getMimeType(dbFile.extension);

    if (!mimeType || !isYandexOcrMimeType(mimeType)) {
        throw new Error(
            `Расширение «${dbFile.extension}» не поддерживается Yandex OCR. ` +
            `Допустимые форматы: jpeg, png, pdf`,
        );
    }

    // Создаём начальную запись — сигнализирует о запуске OCR
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

    // Запускаем воркер без ожидания — он работает полностью в фоне
    workerPool.launch(worker);
}
