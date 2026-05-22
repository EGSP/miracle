import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { WorkerStatus } from '@miracle/types';
import type {
    Designation,
    DesignationWorkerData,
    DesignationWorkerInput,
    Order,
    OrderDetails,
    OrderRequirement,
    Stored,
    TechnicalCondition,
} from '@miracle/types';
import { ordersService } from '../databases/order.db.js';
import { technicalConditionsService } from '../databases/technical-condition.db.js';
import { workersService } from '../databases/workers.db.js';
import { yandexLlm } from '../lib/yandex/yandex-llm.js';
import { countTokens } from '../lib/tokens/tokens.js';
import { logger } from '../logger/logger.js';
import { BaseWorker } from './base-worker.js';

const POLL_INTERVAL_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Zod-схема ответа LLM ─────────────────────────────────────────────────

const DesignationResultZodSchema = z.object({
    values: z
        .array(
            z.object({
                slotIndex: z.number()
                    .describe('Индекс слота (DesignationSlot.index) из переданного списка параметров'),
                value: z.string().nullable()
                    .describe(
                        'Итоговое значение строго из вариантов, перечисленных в правилах ТУ. '
                        + 'null — если по требованиям заявки и правилам ТУ значение нельзя '
                        + 'определить даже приблизительно.',
                    ),
                confidence: z.number().min(0).max(1)
                    .describe(
                        'Уверенность: 1.0 — явно в требованиях; 0.7–0.9 — выводится по смыслу; '
                        + '0.4–0.6 — наиболее вероятный из нескольких; ≤ 0.3 или value=null — не определимо.',
                    ),
                reasoning: z.string()
                    .describe(
                        '1–2 фразы: какое требование заявки и какое место правил ТУ привели к ответу. '
                        + 'Если value=null — что именно неоднозначно или отсутствует.',
                    ),
            }),
        )
        .describe('По одному элементу на каждый переданный DesignationSlot'),
});

type DesignationResult = z.infer<typeof DesignationResultZodSchema>;
const DesignationResultJsonSchema = zodToJsonSchema(DesignationResultZodSchema);

// ─── Системный промпт ─────────────────────────────────────────────────────

export const DESIGNATION_SYSTEM_PROMPT = `Ты определяешь значения параметров условного обозначения промышленной продукции.

На вход поступает:
1. Текст требований заказчика — пары "параметр" → "значение".
2. Список параметров обозначения (слотов). Для каждого слота приведены правила выбора, извлечённые из Технического Условия (ТУ): таблицы кодов, описания вариантов, ограничения.

Для каждого слота:
- Подбери значение строго из допустимых вариантов, перечисленных в правилах ТУ. Не придумывай новые коды и не переводи их в другую запись.
- Опирайся в первую очередь на требования заказчика. Если требование сформулировано не теми же словами, что вариант в правилах ТУ — сопоставляй по смыслу (синонимы, единицы измерения, диапазоны).
- Если правила ТУ задают значение по умолчанию или единственный допустимый вариант — используй его, даже если в требованиях прямого указания нет.
- Если ни требования заявки, ни правила ТУ не позволяют определить значение даже приблизительно — верни value: null и поясни в reasoning, какой именно информации не хватает. Не выдумывай значение, чтобы заполнить поле.

Для каждого значения:
- slotIndex — индекс слота из переданного списка (поле "Слот №…")
- value — итоговое значение строго в той форме, в какой оно фигурирует в правилах ТУ; null если данных недостаточно
- confidence — 1.0 если значение явно указано или выводится напрямую; 0.7–0.9 — выводимо по смыслу; 0.4–0.6 — выбран наиболее вероятный из нескольких; ≤ 0.3 или value=null — не определимо
- reasoning — 1–2 фразы: какое требование заявки и какое место правил ТУ привели к ответу; для value=null — чего именно не хватило

Верни ответ строго в JSON по схеме.`;

// ─── Форматирование частей user-сообщения ─────────────────────────────────

/**
 * Часть B промпта — требования заказчика.
 *
 * Правило наложения слоёв:
 * - Dual-поля clientCompanyName / productCategory: human ?? ai;
 * - requirements: если есть human — используется он (used игнорируется),
 *   иначе ai при условии used !== false; если ни того ни другого — пропуск.
 *
 * Бросает ошибку, если в итоге не осталось ни одного требования —
 * запускать LLM на пустом наборе бессмысленно.
 */
export function formatRequirements(order: Stored<Order>): string {
    const details: OrderDetails | undefined | null = order.details;
    if (!details) {
        throw new Error('У заказа нет details — сначала запустите анализ заявки');
    }

    const productCategory = details.productCategory?.human ?? details.productCategory?.ai;

    const effective: OrderRequirement[] = [];
    for (const dual of details.requirements ?? []) {
        if (dual.human !== undefined) {
            // human-правка приоритетнее и применяется всегда, used игнорируется
            effective.push(dual.human);
            continue;
        }
        if (dual.ai !== undefined && dual.ai.used !== false) {
            effective.push(dual.ai);
        }
    }

    if (effective.length === 0) {
        throw new Error(
            'У заказа нет ни одного активного требования (human или ai с used !== false)',
        );
    }

    const lines = [
        '=== ТРЕБОВАНИЯ ЗАКАЗЧИКА ===',
        '',
        productCategory !== undefined
            ? `Категория продукции: ${productCategory}`
            : 'Категория продукции: (не указана)',
        '',
        'Требования:',
        ...effective.map((req) => `- ${req.parameterName}: ${req.requiredValue}`),
    ];
    return lines.join('\n');
}

/**
 * Часть C промпта — параметры обозначения с правилами из ТУ.
 *
 * Резолвит slot.ruleIds → TC.rules[id].content. Если хоть один id
 * не найден в rules — это рассинхрон данных (слот ссылается на удалённое
 * правило), и воркер должен упасть до отправки в LLM.
 */
export function prepareDesignationSlotsPayload(tc: Stored<TechnicalCondition>): string {
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
                    `Слот №${slot.index} "${slot.name}" ссылается на отсутствующее правило `
                    + `(ruleId=${ruleId}). Перепроверьте TC.rules / TC.designationSlots`,
                );
            }
            return rule.content;
        });

        const joinedRules = ruleContents.length > 0
            ? ruleContents.join('\n\n')
            : '(нет привязанных правил)';

        return [
            `Слот №${slot.index} — ${slot.name}`,
            'Правила из ТУ:',
            '---',
            joinedRules,
            '---',
        ].join('\n');
    });

    return ['=== ПАРАМЕТРЫ ОБОЗНАЧЕНИЯ ===', '', ...blocks].join('\n\n');
}

// ─── Воркер ───────────────────────────────────────────────────────────────

export type DesignationWorkerOptions =
    | { data: null; input: DesignationWorkerInput }
    | { data: Stored<DesignationWorkerData> };

export class DesignationWorker extends BaseWorker {
    readonly type = 'designation-worker' as const;

    private data: Partial<Stored<DesignationWorkerData>>;

    constructor(options: DesignationWorkerOptions) {
        super();
        if (options.data === null) {
            this.data = {
                type: this.type,
                input: options.input,
            };
        } else {
            this.data = { ...options.data };
        }
    }

    async mount(): Promise<void> {
        if (!this.data.input) {
            throw new Error('Воркер не получил input (orderId/tcId)');
        }

        if (!this.data.id) {
            const created = await workersService.create({
                type: this.type,
                status: WorkerStatus.Active,
                input: this.data.input,
            } satisfies DesignationWorkerData);

            this.data = created as Stored<DesignationWorkerData>;
            return;
        }

        const updated = await workersService.update(this.data.id, {
            status: WorkerStatus.Active,
            cloudOperationId: this.data.cloudOperationId,
        });
        this.data = updated as Stored<DesignationWorkerData>;
    }

    async run(): Promise<void> {
        try {
            if (!this.data.id) {
                throw new Error('Воркер не инициализирован: ожидается вызов mount() перед run()');
            }
            if (!this.data.input) {
                throw new Error('Воркер не получил input');
            }

            // Сохраняем id в локальную const, чтобы переприсваивания this.data
            // ниже не сбрасывали narrowing на string | undefined.
            const workerId = this.data.id;

            if (!this.data.cloudOperationId) {
                const { orderId, tcId } = this.data.input;

                const order = await ordersService.get(orderId);
                if (!order) {
                    throw new Error(`Заказ "${orderId}" не найден`);
                }
                const tc = await technicalConditionsService.getById(tcId);
                if (!tc) {
                    throw new Error(`TC "${tcId}" не найдено`);
                }

                const userMessage = [
                    formatRequirements(order),
                    prepareDesignationSlotsPayload(tc),
                ].join('\n\n');

                const finalPrompt = {
                    system: DESIGNATION_SYSTEM_PROMPT,
                    user: userMessage,
                };

                // Сохраняем собранный промпт ДО отправки в LLM. Так на странице
                // превью можно посмотреть его даже если submitCompletion упадёт.
                const withPrompt = await workersService.update(workerId, { finalPrompt });
                this.data = withPrompt as Stored<DesignationWorkerData>;

                const cloudOperationId = await yandexLlm.submitCompletion({
                    messages: [
                        { role: 'system', text: finalPrompt.system },
                        { role: 'user', text: finalPrompt.user },
                    ],
                    temperature: 0.1,
                    maxTokens: countTokens(finalPrompt.system + finalPrompt.user) * 4,
                    jsonSchema: DesignationResultJsonSchema,
                });

                this.data.cloudOperationId = cloudOperationId;
                const updated = await workersService.update(workerId, { cloudOperationId });
                this.data = updated as Stored<DesignationWorkerData>;
            }

            while (!this.shouldStop) {
                const poll = await yandexLlm.pollCompletionJson(
                    this.data.cloudOperationId!,
                    DesignationResultZodSchema,
                );

                if (poll.done) {
                    const operationResult = JSON.stringify(poll.result);
                    const updated = await workersService.update(this.data.id!, { operationResult });
                    this.data = updated as Stored<DesignationWorkerData>;
                    await this.markSuccess();
                    return;
                }

                await sleep(POLL_INTERVAL_MS);
            }

            await this.markStopped();
        } catch (error) {
            const message = DesignationWorker.extractErrorMessage(error);
            logger.error(`[DesignationWorker] run(): ${message}`);

            if (this.data.id) {
                const updated = await workersService.update(this.data.id, {
                    status: WorkerStatus.Failed,
                    errorMessage: message,
                });
                this.data = updated as Stored<DesignationWorkerData>;
            }
        }
    }

    getWorkerRecordId(): string | undefined {
        return this.data.id;
    }

    async apply(): Promise<void> {
        if (!this.data.id) throw new Error('Воркер не инициализирован');
        if (!this.data.input) throw new Error('Воркер не получил input');
        if (!this.data.operationResult) {
            throw new Error('Воркер не содержит результат операции');
        }

        const parsed: DesignationResult = DesignationResultZodSchema.parse(
            JSON.parse(this.data.operationResult),
        );

        const { orderId, tcId } = this.data.input;

        const designation: Designation = {
            tcId,
            values: parsed.values,
        };

        const order = await ordersService.get(orderId);
        if (!order) {
            throw new Error(`Заказ "${orderId}" не найден`);
        }

        const nextDetails: OrderDetails = {
            ...(order.details ?? {}),
            designation: {
                ai: designation,
                ...(order.details?.designation?.human !== undefined
                    && { human: order.details.designation.human }),
            },
        };

        await ordersService.update(orderId, { details: nextDetails });

        logger.info(
            `[DesignationWorker] Order "${orderId}" обновлён: ${designation.values.length} значений по TC "${tcId}"`,
        );
    }

    private async markSuccess(): Promise<void> {
        if (!this.data.id) return;
        const updated = await workersService.update(this.data.id, { status: WorkerStatus.Success });
        this.data = updated as Stored<DesignationWorkerData>;
    }

    private async markStopped(): Promise<void> {
        if (!this.data.id) return;
        const updated = await workersService.update(this.data.id, { status: WorkerStatus.Stopped });
        this.data = updated as Stored<DesignationWorkerData>;
    }
}
