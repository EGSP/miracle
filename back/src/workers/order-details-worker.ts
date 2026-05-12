import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExtractionStatus, ProductCategory, WorkerStatus } from '@miracle/types';
import type { OrderDetails, OrderDetailsWorkerData } from '@miracle/types';
import { ordersService } from '../databases/order.db.js';
import { filesContentService } from '../databases/file-content.db.js';
import { workersService } from '../databases/workers.db.js';
import { yandexLlm } from '../lib/yandex/yandex-llm.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

const POLL_INTERVAL_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Значения перечисления вынесены отдельно — в будущем ожидается расширение до 4–6 категорий
const productCategoryValues = Object.values(ProductCategory) as [ProductCategory, ...ProductCategory[]];

const OrderDetailsSchema = z.object({
    clientCompanyName: z
        .string()
        .describe('Полное или сокращённое название компании-заказчика')
        .optional(),
    productCategory: z
        .enum(productCategoryValues)
        .describe(`Категория заказываемой продукции. Допустимые значения: ${productCategoryValues.join(', ')}`)
        .optional(),
    requirements: z
        .array(
            z.object({
                parameterName: z
                    .string()
                    .describe('Полное название параметра или требования из заявки, включая единицы измерения и технические обозначения (например: "Размеры стального трубопровода D*s, мм")'),
                requiredValue: z
                    .string()
                    .describe('Конкретное значение, требуемое заказчиком для этого параметра (например: "∅159х4,5", "Сталь 45", "ПЭ100 ГАЗ SDR11")'),
            }),
        )
        .describe('Список технических и коммерческих требований к заказу в виде пар "название параметра" → "требуемое значение"')
        .optional(),
});

const orderDetailsJsonSchema = zodToJsonSchema(OrderDetailsSchema);

const SYSTEM_PROMPT = `Ты — ассистент для анализа заказов на промышленную продукцию.
Тебе передаётся текст, извлечённый из документа. Текст может быть получен через OCR (распознавание изображения) или парсинг (разбор структурированного файла). В обоих случаях возможны артефакты: лишние пробелы, опечатки, неверно распознанные символы (О→0, l→1 и т.п.), смещённые столбцы таблиц.
Извлеки из текста структурированные данные строго по переданной JSON-схеме.
Если таблица была превращена в обычный текст, соседние строки часто образуют пару "название параметра" → "требуемое значение". Восстанавливай такие пары по смыслу и близости строк.
Для каждого элемента requirements:
- parameterName — полное название характеристики из заявки, включая единицы измерения и техническое обозначение, если они есть.
- requiredValue — конкретное значение, указанное заказчиком для этой характеристики.
- Не меняй местами название характеристики и значение.
- Не сокращай название характеристики до одного технического обозначения, если рядом есть полная формулировка.
- Не включай пустые поля, заголовки разделов и служебный текст как требования.
Пример: строки "Размеры стального трубопровода D*s, мм" и "∅159х4,5" должны стать {"parameterName":"Размеры стального трубопровода D*s, мм","requiredValue":"∅159х4,5"}.
Если какое-либо поле не удаётся определить из текста — пропусти его (не включай в ответ).
Категорию продукта выбирай только из допустимых значений схемы.
Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.`;

type OrderDetailsWorkerParams = {
    orderId: string;
    existingWorkerId?: string;
    existingCloudOperationId?: string;
};

export class OrderDetailsWorker extends BaseWorker {
    readonly type = 'order-details-worker' as const;

    private readonly orderId: string;
    private workerId?: string;
    private cloudOperationId?: string;

    constructor(params: OrderDetailsWorkerParams) {
        super();
        this.orderId = params.orderId;
        this.workerId = params.existingWorkerId;
        this.cloudOperationId = params.existingCloudOperationId;
    }

    async mount(): Promise<void> {
        if (!this.workerId) {
            const worker = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                orderId: this.orderId,
                cloudOperationId: this.cloudOperationId,
            } satisfies OrderDetailsWorkerData);
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
                const text = await this.getFileText();
                this.cloudOperationId = await yandexLlm.submitCompletion({
                    messages: [
                        { role: 'system', text: SYSTEM_PROMPT },
                        { role: 'user', text },
                    ],
                    temperature: 0.1,
                    jsonSchema: orderDetailsJsonSchema,
                });
                await workersService.update(this.workerId, { cloudOperationId: this.cloudOperationId });
                logger.info(`[OrderDetailsWorker] LLM операция запущена: ${this.cloudOperationId}`);
            }

            while (!this.shouldStop) {
                const poll = await yandexLlm.pollCompletionJson(this.cloudOperationId, OrderDetailsSchema);

                if (poll.done) {
                    const orderDetails: OrderDetails = poll.result;
                    await ordersService.update(this.orderId, { analysedDetails: orderDetails });
                    await workersService.update(this.workerId, { orderDetails });
                    await this.markSuccess();
                    return;
                }

                await sleep(POLL_INTERVAL_MS);
            }

            await this.markStopped();
        } catch (error) {
            const message = OrderDetailsWorker.extractErrorMessage(error);
            logger.error(`[OrderDetailsWorker] Ошибка для заказа "${this.orderId}": ${message}`);

            if (this.workerId) {
                await workersService.update(this.workerId, {
                    status: WorkerStatus.Failed,
                    errorMessage: message,
                });
            }
        }
    }

    private async getFileText(): Promise<string> {
        const order = await ordersService.get(this.orderId);
        if (!order) {
            throw new Error(`Заказ "${this.orderId}" не найден`);
        }
        if (!order.fileId) {
            throw new Error(`У заказа "${this.orderId}" не прикреплён файл`);
        }

        const contents = await filesContentService.getContent(order.fileId);
        const completed = contents.find(
            (c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED,
        );

        if (!completed) {
            throw new Error(`Файл "${order.fileId}" не имеет завершённого извлечения содержимого`);
        }

        const text = (completed.content ?? [])
            .map((page) => page.text ?? '')
            .filter(Boolean)
            .join('\n\n');

        if (!text) {
            throw new Error(`Файл "${order.fileId}" не содержит извлечённого текста`);
        }

        return text;
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
