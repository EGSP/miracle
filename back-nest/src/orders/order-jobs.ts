import { Effect } from 'effect';
import { z } from 'zod';
import {
    ExtractionStatus,
    type Designation,
    type DesignationWorkerInput,
    type Order,
    type OrderDetails,
    type OrderRequirement,
    type ProductType,
    type Stored,
    type TechnicalCondition,
} from '@miracle/types';
import type { Memo } from '../jobs/context.js';
import { andThen, named } from '../jobs/combinators.js';
import { leaf, type AnyJob } from '../jobs/job.js';
import { submitOnce, pollUntilDone } from '../common/cloud-job.js';
import { countTokens } from '../common/count-tokens.js';
import { resolveProductType, type LlmProductType } from './resolve-product-type.js';
import type { OrdersService } from './orders.service.js';
import type { FilesContentService } from '../files-content/files-content.service.js';
import type { ProductTypesService } from '../product-types/product-types.service.js';
import type { TechnicalConditionsService } from '../technical-conditions/technical-conditions.service.js';
import type { YandexService } from '../yandex/yandex.service.js';

/** Определение типа продукции в сборке промпта отключено (см. комментарий в старом воркере). */
const INCLUDE_PRODUCT_TYPE = false;

// ─── Анализ деталей заказа ──────────────────────────────────────────────────

const FlatOrderDetailsZodSchema = z.object({
    clientCompanyName: z.string().nullable().describe('Название компании-заказчика; null если не найдено'),
    productType: z
        .object({
            id: z.string().nullable().describe('id типа продукции из справочника или null'),
            name: z.string().nullable().describe('name типа продукции из справочника или null'),
        })
        .nullable()
        .describe('Тип продукции из справочника; null если не определён'),
    requirements: z
        .array(
            z.object({
                parameterName: z.string().describe('Полное название параметра/требования из заявки'),
                requiredValue: z.string().describe('Конкретное значение, требуемое заказчиком'),
            }),
        )
        .nullable()
        .describe('Список требований; null если в заявке нет пар «параметр → значение»'),
});

type FlatOrderDetails = z.infer<typeof FlatOrderDetailsZodSchema>;
const FlatOrderDetailsJsonSchema = z.toJSONSchema(FlatOrderDetailsZodSchema) as Record<string, unknown>;

const ORDER_DETAILS_PROMPT = `Ты — ассистент для анализа заказов на промышленную продукцию.
Тебе передаётся текст, извлечённый из документа (OCR или парсинг). Возможны артефакты: лишние пробелы, опечатки, неверно распознанные символы, смещённые столбцы таблиц.
Извлеки из текста структурированные данные строго по переданной JSON-схеме.
Если таблица превращена в обычный текст, соседние строки часто образуют пару "название параметра" → "требуемое значение". Восстанавливай такие пары по смыслу и близости строк.

Отметки выбора (чекбоксы, галочки, крестики): по ним суди, что заказчик реально выбрал. В requirements включай только выбранное/подтверждённое. Невыбранные пункты не добавляй.

Для каждого элемента requirements:
- parameterName — полное название характеристики из заявки, с единицами измерения и обозначением.
- requiredValue — конкретное значение (в т.ч. выбранный вариант или краткое «требуется»).
- Не меняй местами название и значение; не сокращай название; не включай заголовки/служебный текст.
Поля clientCompanyName, productType, requirements всегда присутствуют: если данных нет — null.
Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.`;

function buildOrderDetailsUserMessage(applicationText: string): string {
    return [
        '=== ТИП ПРОДУКЦИИ ===',
        '',
        'Определение типа продукции для этого запроса отключено.',
        'В JSON-ответе укажи productType: null (id и name не заполняй).',
        '',
        '=== ТЕКСТ ЗАЯВКИ ===',
        '',
        applicationText,
    ].join('\n');
}

function flatToDualOrderDetails(
    flat: FlatOrderDetails,
    catalog: Stored<ProductType>[],
    findByNameOrSynonym: (name: string) => Stored<ProductType> | undefined,
): OrderDetails | null {
    const resolvedType = resolveProductType(flat.productType as LlmProductType, catalog, findByNameOrSynonym);
    const requirements = flat.requirements ?? [];

    if (flat.clientCompanyName == null && resolvedType === undefined && requirements.length === 0) {
        return null;
    }

    const out: OrderDetails = {};
    if (flat.clientCompanyName != null && flat.clientCompanyName.trim() !== '') {
        out.clientCompanyName = { ai: flat.clientCompanyName };
    }
    if (resolvedType !== undefined) {
        out.productTypeId = resolvedType.productTypeId;
        out.productTypeName = resolvedType.productTypeName;
    }
    if (requirements.length > 0) {
        out.requirements = requirements.map((req, index): { ai: OrderRequirement } => ({
            ai: { index, parameterName: req.parameterName, requiredValue: req.requiredValue, used: true },
        }));
    }
    return out;
}

// ─── Анализ обозначения (designation) ────────────────────────────────────────

const DesignationResultZodSchema = z.object({
    values: z
        .array(
            z.object({
                slotIndex: z.number().describe('Индекс слота (DesignationSlot.index) из переданного списка'),
                value: z.string().nullable().describe('Значение строго из вариантов правил ТУ; null если не определимо'),
                confidence: z.number().min(0).max(1).describe('Уверенность 0..1'),
                reasoning: z.string().describe('1–2 фразы обоснования; для null — чего не хватило'),
            }),
        )
        .describe('По одному элементу на каждый переданный DesignationSlot'),
});

type DesignationResult = z.infer<typeof DesignationResultZodSchema>;
const DesignationResultJsonSchema = z.toJSONSchema(DesignationResultZodSchema) as Record<string, unknown>;

const DESIGNATION_PROMPT = `Ты определяешь значения параметров условного обозначения промышленной продукции.

На вход поступает:
1. Текст требований заказчика — пары "параметр" → "значение".
2. Список параметров обозначения (слотов) с правилами выбора из Технического Условия (ТУ).

Для каждого слота:
- Подбери значение строго из допустимых вариантов правил ТУ. Не придумывай новые коды.
- Опирайся в первую очередь на требования заказчика; сопоставляй по смыслу при иной формулировке.
- Если правила ТУ задают значение по умолчанию или единственный вариант — используй его.
- Если определить нельзя даже приблизительно — value: null с пояснением в reasoning.

Для каждого значения: slotIndex, value (или null), confidence (0..1), reasoning (1–2 фразы).
Верни ответ строго в JSON по схеме.`;

function formatRequirements(order: Stored<Order>): string {
    const details: OrderDetails | undefined | null = order.details;
    if (!details) {
        throw new Error('У заказа нет details — сначала запустите анализ заявки');
    }

    const productTypeLine =
        details.productTypeId && details.productTypeName
            ? `Тип продукции: ${details.productTypeName} (id: ${details.productTypeId})`
            : 'Тип продукции: не указан';

    const effective: OrderRequirement[] = [];
    for (const dual of details.requirements ?? []) {
        if (dual.human !== undefined) {
            effective.push(dual.human);
            continue;
        }
        if (dual.ai !== undefined && dual.ai.used !== false) {
            effective.push(dual.ai);
        }
    }
    if (effective.length === 0) {
        throw new Error('У заказа нет ни одного активного требования (human или ai с used !== false)');
    }

    return [
        '=== ТРЕБОВАНИЯ ЗАКАЗЧИКА ===',
        '',
        productTypeLine,
        '',
        'Требования:',
        ...effective.map((req) => `- ${req.parameterName}: ${req.requiredValue}`),
    ].join('\n');
}

function prepareDesignationSlotsPayload(tc: Stored<TechnicalCondition>): string {
    const slots = tc.designationSlots ?? [];
    if (slots.length === 0) {
        throw new Error('У ТУ не заданы параметры условного обозначения (designationSlots пусто)');
    }

    const rulesById = new Map((tc.rules ?? []).map((rule) => [rule.id, rule]));
    const orderedSlots = [...slots].sort((a, b) => a.index - b.index);

    const blocks = orderedSlots.map((slot) => {
        const ruleContents = slot.ruleIds.map((ruleId) => {
            const rule = rulesById.get(ruleId);
            if (!rule) {
                throw new Error(
                    `Слот №${slot.index} "${slot.name}" ссылается на отсутствующее правило (ruleId=${ruleId})`,
                );
            }
            return rule.content;
        });
        const joinedRules = ruleContents.length > 0 ? ruleContents.join('\n\n') : '(нет привязанных правил)';
        return [`Слот №${slot.index} — ${slot.name}`, 'Правила из ТУ:', '---', joinedRules, '---'].join('\n');
    });

    return ['=== ПАРАМЕТРЫ ОБОЗНАЧЕНИЯ ===', '', ...blocks].join('\n\n');
}

// ─── Фабрика джобов ───────────────────────────────────────────────────────────

export type OrderJobsDeps = {
    orders: Pick<OrdersService, 'get' | 'update'>;
    filesContent: Pick<FilesContentService, 'getContent'>;
    productTypes: Pick<ProductTypesService, 'getAll' | 'findByNameOrSynonym'>;
    tc: Pick<TechnicalConditionsService, 'getById'>;
    yandex: Pick<YandexService, 'submitCompletion' | 'pollCompletionJson'>;
};

type OrderAnalyseMid = { orderId: string; details: OrderDetails };
type DesignationMid = { orderId: string; tcId: string; values: DesignationResult['values'] };

export function createOrderJobs(deps: OrderJobsDeps): {
    orderAnalyse: AnyJob;
    designationAnalyse: AnyJob;
} {
    const getOrderFileText = (orderId: string): Effect.Effect<string, Error> =>
        Effect.gen(function* () {
            const order = deps.orders.get(orderId);
            if (!order) return yield* Effect.fail(new Error(`Заказ "${orderId}" не найден`));
            if (!order.fileId) return yield* Effect.fail(new Error(`У заказа "${orderId}" не прикреплён файл`));
            const completed = deps.filesContent
                .getContent(order.fileId)
                .find((c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED);
            if (!completed) {
                return yield* Effect.fail(new Error(`Файл "${order.fileId}" не имеет завершённого извлечения`));
            }
            const text = (completed.content ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n\n');
            if (!text) return yield* Effect.fail(new Error(`Файл "${order.fileId}" не содержит текста`));
            return text;
        });

    const orderDetailsLlm = leaf(
        'order-details-llm',
        (input: { orderId: string }): Effect.Effect<OrderAnalyseMid, unknown, Memo> =>
            Effect.gen(function* () {
                const text = yield* getOrderFileText(input.orderId);
                const userText = buildOrderDetailsUserMessage(text);
                const opId = yield* submitOnce(
                    () =>
                        deps.yandex.submitCompletion({
                            messages: [
                                { role: 'system', text: ORDER_DETAILS_PROMPT },
                                { role: 'user', text: userText },
                            ],
                            temperature: 0.1,
                            maxTokens: countTokens(ORDER_DETAILS_PROMPT + userText) * 10,
                            jsonSchema: FlatOrderDetailsJsonSchema,
                        }),
                    { finalPrompt: { system: ORDER_DETAILS_PROMPT, user: userText } },
                );
                const flat = yield* pollUntilDone<FlatOrderDetails>(() =>
                    deps.yandex.pollCompletionJson(opId, FlatOrderDetailsZodSchema),
                );
                const catalog = deps.productTypes.getAll();
                const details = flatToDualOrderDetails(flat, catalog, (name) =>
                    deps.productTypes.findByNameOrSynonym(name),
                );
                if (!details) {
                    return yield* Effect.fail(new Error(`Не удалось извлечь данные из заказа: ${JSON.stringify(flat)}`));
                }
                return { orderId: input.orderId, details };
            }),
    );

    const orderDetailsApply = leaf('order-details-apply', (input: OrderAnalyseMid) =>
        Effect.promise(() => deps.orders.update(input.orderId, { details: input.details })).pipe(Effect.asVoid),
    );

    const designationLlm = leaf(
        'designation-llm',
        (input: DesignationWorkerInput): Effect.Effect<DesignationMid, unknown, Memo> =>
            Effect.gen(function* () {
                const order = deps.orders.get(input.orderId);
                if (!order) return yield* Effect.fail(new Error(`Заказ "${input.orderId}" не найден`));
                const tc = deps.tc.getById(input.tcId);
                if (!tc) return yield* Effect.fail(new Error(`TC "${input.tcId}" не найдено`));

                const userMessage = [formatRequirements(order), prepareDesignationSlotsPayload(tc)].join('\n\n');
                const opId = yield* submitOnce(
                    () =>
                        deps.yandex.submitCompletion({
                            messages: [
                                { role: 'system', text: DESIGNATION_PROMPT },
                                { role: 'user', text: userMessage },
                            ],
                            temperature: 0.1,
                            maxTokens: countTokens(DESIGNATION_PROMPT + userMessage) * 4,
                            jsonSchema: DesignationResultJsonSchema,
                        }),
                    { finalPrompt: { system: DESIGNATION_PROMPT, user: userMessage } },
                );
                const result = yield* pollUntilDone<DesignationResult>(() =>
                    deps.yandex.pollCompletionJson(opId, DesignationResultZodSchema),
                );
                return { orderId: input.orderId, tcId: input.tcId, values: result.values };
            }),
    );

    const designationApply = leaf('designation-apply', (input: DesignationMid) =>
        Effect.gen(function* () {
            const order = deps.orders.get(input.orderId);
            if (!order) return yield* Effect.fail(new Error(`Заказ "${input.orderId}" не найден`));

            const designation: Designation = { tcId: input.tcId, values: input.values };
            const nextDetails: OrderDetails = {
                ...(order.details ?? {}),
                designation: {
                    ai: designation,
                    ...(order.details?.designation?.human !== undefined
                        ? { human: order.details.designation.human }
                        : {}),
                },
            };
            yield* Effect.promise(() => deps.orders.update(input.orderId, { details: nextDetails }));
        }),
    );

    return {
        orderAnalyse: orderDetailsLlm.pipe(andThen(orderDetailsApply), named('order-analyse')),
        designationAnalyse: designationLlm.pipe(andThen(designationApply), named('designation-analyse')),
    };
}
