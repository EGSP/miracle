import fs from 'fs/promises';
import { waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { operation } from '@yandex-cloud/nodejs-sdk/operation';
import { ExtractionStatus, ExtractionType, WorkerStatus, type Content } from '@miracle/types';
import type { Stored, YandexOcrWorkerData } from '@miracle/types';
import { yandex } from '../lib/yandex/yandex.js';
import type { AsyncOcrClient } from '../lib/yandex/yandex-sdk.types.js';
import { filesContentService } from '../databases/file-content.db.js';
import { filesService, getFilePath } from '../databases/file.db.js';
import { workersService } from '../databases/workers.db.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

export type YandexOcrWorkerOptions =
    | { data: null; fileContentId: string; fileId: string; mimeType: string }
    | { data: Stored<YandexOcrWorkerData> };

export class YandexOcrWorker extends BaseWorker {
    readonly type = 'yandex-ocr-worker' as const;

    private data: Partial<Stored<YandexOcrWorkerData>>;

    constructor(options: YandexOcrWorkerOptions) {
        super();
        if (options.data === null) {
            this.data = {
                type: this.type,
                fileContentId: options.fileContentId,
                fileId: options.fileId,
                mimeType: options.mimeType,
            };
        } else {
            this.data = { ...options.data };
        }
    }

    async mount(): Promise<void> {
        if (!this.data.id) {
            const createdWD = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                fileId: this.data.fileId!,
                fileContentId: this.data.fileContentId!,
                mimeType: this.data.mimeType!,
                cloudOperationId: this.data.cloudOperationId,
                operationDone: false,
            } satisfies YandexOcrWorkerData);
            this.data = createdWD as Stored<YandexOcrWorkerData>;
            return;
        }

        const updatedWD = await workersService.update(this.data.id, {
            status: WorkerStatus.Active,
            cloudOperationId: this.data.cloudOperationId,
        });
        this.data = updatedWD as Stored<YandexOcrWorkerData>;
    }

    async run(): Promise<void> {
        try {
            if (!this.data.id) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            if (!this.data.cloudOperationId) {
                const opId = await this.startRecognition();
                const updatedWD = await workersService.update(this.data.id, {
                    status: WorkerStatus.Active,
                    cloudOperationId: opId,
                });
                this.data = updatedWD as Stored<YandexOcrWorkerData>;
            }

            if (!this.data.id) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            const session = yandex.getSession();
            const asyncClient = session.client(ocrService.TextRecognitionAsyncServiceClient) as unknown as AsyncOcrClient;

            const finished = await waitForOperation(
                operation.Operation.fromPartial({ id: this.data.cloudOperationId, done: false }),
                session,
            );

            if (!finished.done) {
                throw new Error(`Операция Yandex OCR "${this.data.cloudOperationId}" не завершилась`);
            }

            if (this.shouldStop) {
                await this.markStopped();
                return;
            }

            const pages = await this.readPages(asyncClient);
            const aggregatedText = pages.map((page) => page.text ?? '').filter(Boolean).join('\n\n');

            const updatedWD = await workersService.update(this.data.id, {
                operationDone: true,
                operationResult: aggregatedText,
                operationErrorMessage: undefined,
                ocrPages: pages,
            });
            this.data = updatedWD as Stored<YandexOcrWorkerData>;

            await this.markSuccess();
        } catch (error) {
            const message = YandexOcrWorker.extractErrorMessage(error);
            logger.error(`[YandexOcrWorker] Ошибка обработки файла "${this.data.fileId}": ${message}`);

            await filesContentService.update({
                id: this.data.fileContentId!,
                fileId: this.data.fileId!,
                meta: {
                    extractionType: ExtractionType.OCR,
                    extractionStatus: ExtractionStatus.FAILED,
                    extractionFailedMessage: message,
                },
            });

            if (this.data.id) {
                const updatedWD = await workersService.update(this.data.id, {
                    operationDone: true,
                    operationErrorMessage: message,
                    status: WorkerStatus.Failed,
                });
                this.data = updatedWD as Stored<YandexOcrWorkerData>;
            }
        }
    }

    getWorkerRecordId(): string | undefined {
        return this.data.id;
    }

    async apply(): Promise<void> {
        if (!this.data.id) {
            throw new Error('Воркер не инициализирован');
        }
        if (this.data.type !== 'yandex-ocr-worker') {
            throw new Error('Неверный тип воркера');
        }
        const pages = this.data.ocrPages;
        if (pages !== undefined && pages.length > 0) {
            await filesContentService.update({
                id: this.data.fileContentId!,
                fileId: this.data.fileId!,
                content: pages,
                meta: {
                    extractionType: ExtractionType.OCR,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
            });
            return;
        }
        const fallbackText = this.data.operationResult?.trim();
        if (fallbackText !== undefined && fallbackText !== '') {
            await filesContentService.update({
                id: this.data.fileContentId!,
                fileId: this.data.fileId!,
                content: [{ text: fallbackText }],
                meta: {
                    extractionType: ExtractionType.OCR,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
            });
            return;
        }
        throw new Error('Нет сохранённых страниц OCR и агрегированного текста для применения');
    }

    private async startRecognition(): Promise<string> {
        const file = await filesService.get(this.data.fileId!);
        if (!file) {
            throw new Error(`Файл "${this.data.fileId}" не найден`);
        }

        const filePath = getFilePath(file);
        const fileData = await fs.readFile(filePath);

        const yandexConfig = yandex.getConfig();
        const session = yandex.getSession();
        const asyncClient = session.client(ocrService.TextRecognitionAsyncServiceClient) as unknown as AsyncOcrClient;

        const op = await asyncClient.recognize({
            mimeType: this.data.mimeType!,
            content: fileData,
            folderId: yandexConfig.folderId,
            languageCodes: [
                'ru',
            ],
            model: '',
        });

        if (!op.id) {
            throw new Error('Yandex OCR не вернул идентификатор операции');
        }

        return op.id;
    }

    private async readPages(asyncClient: AsyncOcrClient): Promise<Content[]> {
        const stream = asyncClient.getRecognition({ operationId: this.data.cloudOperationId ?? '' });
        const pages: Content[] = [];

        for await (const page of stream) {
            pages.push({
                page: page.page,
                text: page.textAnnotation?.fullText,
            });
        }

        return pages;
    }

    private async markSuccess(): Promise<void> {
        if (!this.data.id) return;
        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Success });
        this.data = updatedWD as Stored<YandexOcrWorkerData>;
    }

    private async markStopped(): Promise<void> {
        if (!this.data.id) return;
        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Stopped });
        this.data = updatedWD as Stored<YandexOcrWorkerData>;
    }
}
