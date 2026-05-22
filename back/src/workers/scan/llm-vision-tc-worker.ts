import fs from 'fs/promises';
import { ExtractionStatus, ExtractionType, WorkerStatus } from '@miracle/types';
import type { LlmVisionTcWorkerData, Stored } from '@miracle/types';
import { filesContentService } from '../../databases/file-content.db.js';
import { filesService, getFilePath } from '../../databases/file.db.js';
import { workersService } from '../../databases/workers.db.js';
import { pdfToImages } from '../../lib/convert/pdf-to-image.js';
import { yandexLlm } from '../../lib/yandex/yandex-llm.js';
import { logger } from '../../logger/logger.js';
import { BaseWorker } from '../base-worker.js';

const SYSTEM_PROMPT = `Ты — ассистент для извлечения содержимого из документов Технических Условий (ТУ).
Тебе передаются страницы PDF в виде изображений.

Извлеки весь текст документа с сохранением структуры:
- Заголовки разделов и подразделов с исходной нумерацией из ТУ
- Обычный текст — дословно, в порядке следования в документе
- Таблицы — в формате markdown-таблиц с сохранением всех строк, столбцов и заголовков
- Списки и перечисления — с сохранением маркировки и уровней вложенности
- Формулы, обозначения, единицы измерения — без интерпретации и перефразирования

Особое внимание:
- Таблицы технических условий (параметры, допустимые значения, коды обозначений) — извлекай полностью
- Сохраняй связь между номером пункта ТУ и его содержанием
- Не пропускай текст мелким шрифтом, сноски, примечания к таблицам

Не добавляй комментариев, пояснений и интерпретаций от себя.
Верни единый связный текст документа в формате markdown.`;

const USER_MESSAGE = 'Извлеки содержимое документа Технических Условий.';

export type LlmVisionTcWorkerOptions =
    | { data: null; fileId: string; fileContentId: string }
    | { data: Stored<LlmVisionTcWorkerData> };

export class LlmVisionTcWorker extends BaseWorker {
    readonly type = 'llm-vision-tc-worker' as const;

    private data: Partial<Stored<LlmVisionTcWorkerData>>;

    constructor(options: LlmVisionTcWorkerOptions) {
        super();
        if (options.data === null) {
            this.data = {
                type: this.type,
                fileId: options.fileId,
                fileContentId: options.fileContentId,
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
            } satisfies LlmVisionTcWorkerData);
            this.data = createdWD as Stored<LlmVisionTcWorkerData>;
            return;
        }

        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Active });
        this.data = updatedWD as Stored<LlmVisionTcWorkerData>;
    }

    async run(): Promise<void> {
        try {
            if (!this.data.id) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            if (!this.data.cloudOperationId) {
                const images = await this.renderPages();
                const taskId = await yandexLlm.submitVisionCompletion({
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
                                { type: 'input_text' as const, text: USER_MESSAGE },
                            ],
                        },
                    ],
                });
                const updatedWD = await workersService.update(this.data.id, { cloudOperationId: taskId });
                this.data = updatedWD as Stored<LlmVisionTcWorkerData>;
            }

            while (true) {
                if (this.shouldStop) {
                    await this.markStopped();
                    return;
                }

                const poll = await yandexLlm.pollVisionCompletion(this.data.cloudOperationId!);

                if (poll.done) {
                    const updatedWD = await workersService.update(this.data.id!, { operationResult: poll.result });
                    this.data = updatedWD as Stored<LlmVisionTcWorkerData>;
                    await this.markSuccess();
                    break;
                }

                await new Promise<void>((resolve) => setTimeout(resolve, 3000));
            }
        } catch (error) {
            const message = LlmVisionTcWorker.extractErrorMessage(error);
            logger.error(`[LlmVisionTcWorker] Ошибка обработки файла "${this.data.fileId}": ${message}`);

            await filesContentService.update({
                id: this.data.fileContentId!,
                fileId: this.data.fileId!,
                meta: {
                    extractionType: ExtractionType.LLM,
                    extractionStatus: ExtractionStatus.FAILED,
                    extractionFailedMessage: message,
                },
            });

            if (this.data.id) {
                const updatedWD = await workersService.update(this.data.id, {
                    status: WorkerStatus.Failed,
                    errorMessage: message,
                });
                this.data = updatedWD as Stored<LlmVisionTcWorkerData>;
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
        if (this.data.type !== 'llm-vision-tc-worker') {
            throw new Error('Неверный тип воркера');
        }
        const text = this.data.operationResult?.trim();
        if (text === undefined || text === '') {
            throw new Error('Нет сохранённого текста LLM для применения');
        }
        await filesContentService.update({
            id: this.data.fileContentId!,
            fileId: this.data.fileId!,
            content: [{ text }],
            meta: {
                extractionType: ExtractionType.LLM,
                extractionStatus: ExtractionStatus.COMPLETED,
            },
        });
    }

    private async renderPages() {
        const file = await filesService.get(this.data.fileId!);
        if (!file) throw new Error(`Файл "${this.data.fileId}" не найден`);

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
        if (!this.data.id) return;
        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Success });
        this.data = updatedWD as Stored<LlmVisionTcWorkerData>;
    }

    private async markStopped(): Promise<void> {
        if (!this.data.id) return;
        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Stopped });
        this.data = updatedWD as Stored<LlmVisionTcWorkerData>;
    }
}
