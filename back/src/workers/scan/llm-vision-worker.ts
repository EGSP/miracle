import fs from 'fs/promises';
import { ExtractionStatus, ExtractionType, WorkerStatus } from '@miracle/types';
import type { LlmVisionWorkerData, Stored } from '@miracle/types';
import { filesContentService } from '../../databases/file-content.db.js';
import { filesService, getFilePath } from '../../databases/file.db.js';
import { workersService } from '../../databases/workers.db.js';
import { pdfToImages } from '../../lib/convert/pdf-to-image.js';
import { yandexLlm } from '../../lib/yandex/yandex-llm.js';
import { logger } from '../../logger/logger.js';
import { BaseWorker } from '../base-worker.js';

const SYSTEM_PROMPT = `Ты — ассистент для извлечения содержимого из документов со сложной структурой.
Тебе передаются страницы документа в виде изображений.
Извлеки весь текст и структурированные данные: таблицы, списки, поля форм.

Варианты с отметкой (чекбокс, крестик, галочка, выбор одного из нескольких):
Смотри только на отметку на изображении, не на смысл слов в подписи.

Для каждого варианта в таком блоке — отдельная строка (без символов ☑ ☐ ✓ ✗ [x] и без слов «отмечено», «вариант N»):
  Выбрано: <дословный текст этого варианта из документа>
  Не выбрано: <дословный текст этого варианта из документа>

Правила:
- В одном блоке выбора (одна строка таблицы, один номер пункта, один вопрос) у каждой альтернативы должна быть строка «Выбрано:» или «Не выбрано:». Не оставляй в блоке выбора строк без этих префиксов.
- Если отмечен один из нескольких — у него «Выбрано:», у остальных альтернатив того же блока — «Не выбрано:».
- Если можно отметить несколько — у каждой отмеченной «Выбрано:», у каждой неотмеченной «Не выбрано:».
- Префикс — только статус отметки. Текст после двоеточия копируй из документа как есть, даже если там «без …», «не …» или строка «Не требуется».

Перед вариантами блока можно один раз вывести заголовок из документа (номер пункта, название графы), без префикса.

Остальной текст без отметок — как в документе, в исходном порядке.
Не добавляй комментариев от себя.`;

export type LlmVisionWorkerOptions =
    | { data: null; fileId: string; fileContentId: string }
    | { data: Stored<LlmVisionWorkerData> };

export class LlmVisionWorker extends BaseWorker {
    readonly type = 'llm-vision-worker' as const;

    /** Состояние строки воркера; после create/update совпадает с тем, что в БД. */
    private data: Partial<Stored<LlmVisionWorkerData>>;

    constructor(options: LlmVisionWorkerOptions) {
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
            } satisfies LlmVisionWorkerData);
            this.data = createdWD as Stored<LlmVisionWorkerData>;
            return;
        }

        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Active });
        this.data = updatedWD as Stored<LlmVisionWorkerData>;
    }

    async run(): Promise<void> {
        try {
            if (!this.data.id) {
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

            const updatedWD = await workersService.update(this.data.id, { operationResult: result });
            this.data = updatedWD as Stored<LlmVisionWorkerData>;

            await this.markSuccess();
        } catch (error) {
            const message = LlmVisionWorker.extractErrorMessage(error);
            logger.error(`[LlmVisionWorker] Ошибка обработки файла "${this.data.fileId}": ${message}`);

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
                this.data = updatedWD as Stored<LlmVisionWorkerData>;
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
        if (this.data.type !== 'llm-vision-worker') {
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
        this.data = updatedWD as Stored<LlmVisionWorkerData>;
    }
}
