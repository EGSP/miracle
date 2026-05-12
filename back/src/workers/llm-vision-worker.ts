import fs from 'fs/promises';
import { ExtractionStatus, ExtractionType, WorkerStatus } from '@miracle/types';
import type { LlmVisionWorkerData } from '@miracle/types';
import { filesContentService } from '../databases/file-content.db.js';
import { filesService, getFilePath } from '../databases/file.db.js';
import { workersService } from '../databases/workers.db.js';
import { pdfToImages } from '../lib/convert/pdf-to-image.js';
import { yandexLlm } from '../lib/yandex/yandex-llm.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

const SYSTEM_PROMPT = `Ты — ассистент для извлечения содержимого из документов со сложной структурой.
Тебе передаются страницы документа в виде изображений.
Извлеки весь текст и структурированные данные: таблицы, списки, поля форм.
Для каждого чекбокса, переключателя или поля с отметкой укажи его метку и состояние: отмечен / не отмечен.
Сохраняй исходный порядок элементов. Не добавляй комментариев от себя.`;

type LlmVisionWorkerParams = {
    fileId: string;
    fileContentId: string;
    existingWorkerId?: string;
};

export class LlmVisionWorker extends BaseWorker {
    readonly type = 'llm-vision-worker' as const;

    private readonly fileId: string;
    private readonly fileContentId: string;
    private workerId?: string;

    constructor(params: LlmVisionWorkerParams) {
        super();
        this.fileId = params.fileId;
        this.fileContentId = params.fileContentId;
        this.workerId = params.existingWorkerId;
    }

    async mount(): Promise<void> {
        if (!this.workerId) {
            const worker = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                fileId: this.fileId,
                fileContentId: this.fileContentId,
            } satisfies LlmVisionWorkerData);
            this.workerId = worker.id;
            return;
        }

        await workersService.update(this.workerId, { status: WorkerStatus.Active });
    }

    async run(): Promise<void> {
        try {
            if (!this.workerId) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            const images = await this.renderPages();

            // Responses API синхронный — ответ возвращается сразу, polling не нужен
            const result = await yandexLlm.callVisionCompletion({
                instructions: SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: [
                            ...images.map((p) => ({
                                type: 'input_image' as const,
                                image_url: p.dataUrl,
                                detail: 'auto' as const,
                            })),
                            { type: 'input_text' as const, text: 'Извлеки содержимое документа.' },
                        ],
                    },
                ],
            });

            await workersService.update(this.workerId, { operationResult: result });

            await filesContentService.update({
                id: this.fileContentId,
                fileId: this.fileId,
                content: [{ text: result }],
                meta: {
                    extractionType: ExtractionType.LLM,
                    extractionStatus: ExtractionStatus.COMPLETED,
                },
            });

            await this.markSuccess();
        } catch (error) {
            const message = LlmVisionWorker.extractErrorMessage(error);
            logger.error(`[LlmVisionWorker] Ошибка обработки файла "${this.fileId}": ${message}`);

            await filesContentService.update({
                id: this.fileContentId,
                fileId: this.fileId,
                meta: {
                    extractionType: ExtractionType.LLM,
                    extractionStatus: ExtractionStatus.FAILED,
                    extractionFailedMessage: message,
                },
            });

            if (this.workerId) {
                await workersService.update(this.workerId, {
                    status: WorkerStatus.Failed,
                    errorMessage: message,
                });
            }
        }
    }

    private async renderPages() {
        const file = await filesService.get(this.fileId);
        if (!file) throw new Error(`Файл "${this.fileId}" не найден`);

        const filePath = getFilePath(file);
        const ext = file.extension.toLowerCase();

        if (ext === 'pdf') {
            const buffer = await fs.readFile(filePath);
            return pdfToImages(buffer, { scale: 2.5 });
        }

        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString('base64');
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        return [{ page: 1, base64, dataUrl: `data:${mimeType};base64,${base64}` }];
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
