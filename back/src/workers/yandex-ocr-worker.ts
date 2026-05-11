import fs from 'fs/promises';
import { waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { operation } from '@yandex-cloud/nodejs-sdk/operation';
import { ExtractionStatus, ExtractionType, WorkerStatus, type Content } from '@miracle/types';
import type { WorkerData } from '@miracle/types';
import { yandex } from '../lib/yandex/yandex.js';
import type { AsyncOcrClient } from '../lib/yandex/yandex-sdk.types.js';
import { filesContentService } from '../databases/file-content.db.js';
import { filesService, getFilePath } from '../databases/file.db.js';
import { workersService } from '../databases/workers.db.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

type YandexOcrWorkerParams = {
    fileContentId: string;
    fileId: string;
    mimeType: string;
    existingCloudOperationId?: string;
    existingWorkerId?: string;
};

export class YandexOcrWorker extends BaseWorker {
    readonly type = 'yandex-ocr-worker';

    private readonly fileContentId: string;
    private readonly fileId: string;
    private readonly mimeType: string;
    private cloudOperationId?: string;
    private workerId?: string;

    constructor(params: YandexOcrWorkerParams) {
        super();
        this.fileContentId = params.fileContentId;
        this.fileId = params.fileId;
        this.mimeType = params.mimeType;
        this.cloudOperationId = params.existingCloudOperationId;
        this.workerId = params.existingWorkerId;
    }

    async mount(): Promise<void> {
        if (!this.workerId) {
            const worker = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                fileId: this.fileId,
                fileContentId: this.fileContentId,
                mimeType: this.mimeType,
                cloudOperationId: this.cloudOperationId,
                operationDone: false,
            } satisfies WorkerData);
            this.workerId = worker.id;
            return;
        }

        await workersService.update(this.workerId, {
            status: WorkerStatus.Active,
            cloudOperationId: this.cloudOperationId,
        });
    }

    async run(): Promise<void> {
        try {
            if (!this.workerId) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            if (!this.cloudOperationId) {
                this.cloudOperationId = await this.startRecognition();
                await workersService.update(this.workerId, { status: WorkerStatus.Active, cloudOperationId: this.cloudOperationId });
            }

            const session = yandex.getSession();
            const asyncClient = session.client(ocrService.TextRecognitionAsyncServiceClient) as unknown as AsyncOcrClient;

            const finished = await waitForOperation(
                operation.Operation.fromPartial({ id: this.cloudOperationId, done: false }),
                session,
            );

            if (!finished.done) {
                throw new Error(`Операция Yandex OCR "${this.cloudOperationId}" не завершилась`);
            }

            if (this.shouldStop) {
                await this.markStopped();
                return;
            }

            const pages = await this.readPages(asyncClient);
            const aggregatedText = pages.map((page) => page.text ?? '').filter(Boolean).join('\n\n');

            await filesContentService.update({
                id: this.fileContentId,
                fileId: this.fileId,
                content: pages,
                meta: {
                    extractionType: ExtractionType.OCR,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
            });

            await workersService.update(this.workerId, {
                operationDone: true,
                operationResult: aggregatedText,
                operationErrorMessage: undefined,
            });

            await this.markSuccess();
        } catch (error) {
            const message = YandexOcrWorker.extractErrorMessage(error);
            logger.error(`[YandexOcrWorker] Ошибка обработки файла "${this.fileId}": ${message}`);

            await filesContentService.update({
                id: this.fileContentId,
                fileId: this.fileId,
                meta: {
                    extractionType: ExtractionType.OCR,
                    extractionStatus: ExtractionStatus.FAILED,
                    extractionFailedMessage: message,
                },
            });

            if (this.workerId) {
                await workersService.update(this.workerId, {
                    operationDone: true,
                    operationErrorMessage: message,
                    status: WorkerStatus.Failed,
                });
            }
        }
    }

    private async startRecognition(): Promise<string> {
        const file = await filesService.get(this.fileId);
        if (!file) {
            throw new Error(`Файл "${this.fileId}" не найден`);
        }

        const filePath = getFilePath(file);
        const fileData = await fs.readFile(filePath);

        const yandexConfig = yandex.getConfig();
        const session = yandex.getSession();
        const asyncClient = session.client(ocrService.TextRecognitionAsyncServiceClient) as unknown as AsyncOcrClient;

        const op = await asyncClient.recognize({
            mimeType: this.mimeType,
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
        const stream = asyncClient.getRecognition({ operationId: this.cloudOperationId ?? '' });
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
        if (!this.workerId) return;
        await workersService.update(this.workerId, { status: WorkerStatus.Success });
    }

    private async markStopped(): Promise<void> {
        if (!this.workerId) return;
        await workersService.update(this.workerId, { status: WorkerStatus.Stopped });
    }
}
