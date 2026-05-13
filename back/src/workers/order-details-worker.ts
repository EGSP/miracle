import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExtractionStatus, ProductCategory, WorkerStatus } from '@miracle/types';
import type { OrderDetails, OrderRequirement, OrderDetailsWorkerData, Stored } from '@miracle/types';
import { ordersService } from '../databases/order.db.js';
import { filesContentService } from '../databases/file-content.db.js';
import { workersService } from '../databases/workers.db.js';
import { yandexLlm } from '../lib/yandex/yandex-llm.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';
import { countTokens } from '../lib/tokens/tokens.js';

const POLL_INTERVAL_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Значения перечисления вынесены отдельно — в будущем ожидается расширение до 4–6 категорий
const productCategoryValues = Object.values(ProductCategory) as [ProductCategory, ...ProductCategory[]];

const FlatOrderDetailsZodSchema = z.object({
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
type FlatOrderDetails = z.infer<typeof FlatOrderDetailsZodSchema>;
const flatOrderDetailsJsonSchema = zodToJsonSchema(FlatOrderDetailsZodSchema);

/*
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
*/

const SYSTEM_PROMPT = `Ты — ассистент для анализа заказов на промышленную продукцию.
Тебе передаётся текст, извлечённый из документа. Текст может быть получен через OCR (распознавание изображения) или парсинг (разбор структурированного файла). В обоих случаях возможны артефакты: лишние пробелы, опечатки, неверно распознанные символы (О→0, l→1 и т.п.), смещённые столбцы таблиц.
Извлеки из текста структурированные данные строго по переданной JSON-схеме.
Если таблица была превращена в обычный текст, соседние строки часто образуют пару "название параметра" → "требуемое значение". Восстанавливай такие пары по смыслу и близости строк.

Отметки выбора (чекбоксы, галочки, крестики и аналоги):
- В заявках часто встречаются визуальные отметки: пустой/закрашенный квадрат, ☑ ☐ ✓ ✗ ✕, «V», «+», «X», «да/нет» в отдельной ячейке, [x] / [ ] и похожие обозначения. После OCR они могут выглядеть как отдельные символы в начале/конце строки или в соседнем «столбце» текста — не игнорируй их: по ним суди, что заказчик реально выбрал или подтвердил.
- Если у одной формулировки требования есть отметка «выбрано/да/обязательно», а у альтернативы в той же группе — пусто или отметка «нет/не требуется», в requirements включай только то, что соответствует выбранному или подтверждённому варианту. Невыбранные пункты не добавляй как отдельные требования.
- Для взаимоисключающих вариантов (несколько строк — одна позиция): parameterName — общий контекст или формулировка из документа; requiredValue — текст выбранной (отмеченной) строки/значения. Если в документе явно только одна отмеченная опция среди списка, достаточно пары с этой опцией.
- Если отметка означает просто «применить это требование» без отдельного числового значения, в requiredValue укажи смысл отметки кратко и однозначно (например «требуется», «да», «по ГОСТ …» — если формулировка целиком в названии). Не дублируй в requiredValue только символ галочки без смысла, если из текста ясно, что требование активно.
- Не путай случайный мусор OCR с отметкой: если символ логично стоит у строки варианта или в колонке «отметка», трактуй как отметку; если он явно разорван от смысла строки, опирайся на остальной текст.

Для каждого элемента requirements:
- parameterName — полное название характеристики из заявки, включая единицы измерения и техническое обозначение, если они есть.
- requiredValue — конкретное значение, указанное заказчиком для этой характеристики (в т.ч. выбранный при отметках вариант или краткое подтверждение «требуется», если так зафиксировано в документе).
- Не меняй местами название характеристики и значение.
- Не сокращай название характеристики до одного технического обозначения, если рядом есть полная формулировка.
- Не включай пустые поля, заголовки разделов и служебный текст как требования.
Пример: строки "Размеры стального трубопровода D*s, мм" и "∅159х4,5" должны стать {"parameterName":"Размеры стального трубопровода D*s, мм","requiredValue":"∅159х4,5"}.
Если какое-либо поле не удаётся определить из текста — пропусти его (не включай в ответ).
Категорию продукта выбирай только из допустимых значений схемы.
Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.`;



/**
 * Ответ LLM (плоский JSON по схеме выше) → доменный `OrderDetails`: только слой `ai`,
 * полностью заменяет прежние `details` заказа.
 */
function flatToDualOrderDetails(flat: FlatOrderDetails): OrderDetails | null {
    if (
        flat.clientCompanyName === undefined
        && flat.productCategory === undefined
        && (flat.requirements === undefined || flat.requirements.length === 0)
    ) {
        return null;
    }

    const out: OrderDetails = {};
    if (flat.clientCompanyName !== undefined) {
        out.clientCompanyName = { ai: flat.clientCompanyName };
    }
    if (flat.productCategory !== undefined) {
        out.productCategory = { ai: flat.productCategory };
    }
    if (flat.requirements !== undefined) {
        out.requirements = flat.requirements.map((req, i): { ai: OrderRequirement } => ({
            ai: {
                index: i,
                parameterName: req.parameterName,
                requiredValue: req.requiredValue,
                used: true,
            },
        }));
    }
    return out;
}

export type OrderDetailsWorkerOptions = { data: null; orderId: string } | { data: Stored<OrderDetailsWorkerData> };

export class OrderDetailsWorker extends BaseWorker {
    readonly type = 'order-details-worker' as const;

    private data: Partial<Stored<OrderDetailsWorkerData>>;

    constructor(options: OrderDetailsWorkerOptions) {
        super();
        if (options.data === null) {
            this.data = {
                type: this.type,
                orderId: options.orderId,
            };
        } else {
            this.data = { ...options.data };
        }
    }

    async mount(): Promise<void> {
        if (!this.data.orderId) {
            throw new Error('Воркер не получил идентификатор заказа');
        }

        if (!this.data.id) {
            const createdWD = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                orderId: this.data.orderId,
            } satisfies OrderDetailsWorkerData);

            this.data = createdWD as Stored<OrderDetailsWorkerData>;
            return;
        }

        const updatedWD = await workersService.update(this.data.id, {
            status: WorkerStatus.Active,
            cloudOperationId: this.data.cloudOperationId,
        });
        this.data = updatedWD as Stored<OrderDetailsWorkerData>;
    }

    async run(): Promise<void> {
        try {
            if (!this.data.id) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            if (!this.data.cloudOperationId) {
                const text = await this.getFileText();
                const cloudOperationId = await yandexLlm.submitCompletion({
                    messages: [
                        { role: 'system', text: SYSTEM_PROMPT },
                        { role: 'user', text },
                    ],
                    temperature: 0.1,
                    maxTokens: countTokens(SYSTEM_PROMPT+text) * 10,
                    jsonSchema: flatOrderDetailsJsonSchema,
                });
                this.data.cloudOperationId = cloudOperationId;

                const updatedWD = await workersService.update(this.data.id, { cloudOperationId });
                this.data = updatedWD as Stored<OrderDetailsWorkerData>;
            }

            if(!this.data.id){
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }

            while (!this.shouldStop) {
                const poll = await yandexLlm.pollCompletionJson(this.data.cloudOperationId!, FlatOrderDetailsZodSchema);

                if (poll.done) {
                    const parsed = FlatOrderDetailsZodSchema.parse(poll.result);
                    const details = flatToDualOrderDetails(parsed);
                    if(!details){
                        throw new Error(`Не удалось извлечь данные из заказа: ${JSON.stringify(parsed)}`);
                    }

                    const updatedWD = await workersService.update(this.data.id, { orderDetails: details });
                    this.data = updatedWD as Stored<OrderDetailsWorkerData>;
                    await this.markSuccess();
                    return;
                }

                await sleep(POLL_INTERVAL_MS);
            }

            await this.markStopped();
        } catch (error) {
            const message = OrderDetailsWorker.extractErrorMessage(error);
            
            if (this.data.id) {
                const updatedWD = await workersService.update(this.data.id, {
                    status: WorkerStatus.Failed,
                    errorMessage: message,
                });
                this.data = updatedWD as Stored<OrderDetailsWorkerData>;
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
        if (this.data.type !== 'order-details-worker') {
            throw new Error('Неверный тип воркера');
        }
        if(!this.data.orderId){
            throw new Error('Воркер не получил идентификатор заказа');
        }
        if(!this.data.orderDetails){
            throw new Error('Воркер не получил данные из заказа');
        }
        // logger.info(JSON.stringify(this.data.orderDetails, null, 2));
        await ordersService.update(this.data.orderId, { details: this.data.orderDetails });
    }

    private async getFileText(): Promise<string> {
        if(!this.data.orderId){
            throw new Error('Воркер не получил идентификатор заказа');
        }

        const order = await ordersService.get(this.data.orderId);
        if (!order) {
            throw new Error(`Заказ "${this.data.orderId}" не найден`);
        }
        if (!order.fileId) {
            throw new Error(`У заказа "${this.data.orderId}" не прикреплён файл`);
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
        if (!this.data.id) return;
        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Success });
        this.data = updatedWD as Stored<OrderDetailsWorkerData>;
    }

    private async markStopped(): Promise<void> {
        if (!this.data.id) return;
        const updatedWD = await workersService.update(this.data.id, { status: WorkerStatus.Stopped });
        this.data = updatedWD as Stored<OrderDetailsWorkerData>;
    }
}
