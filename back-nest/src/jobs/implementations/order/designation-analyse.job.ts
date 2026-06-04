import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { z } from 'zod';
import { type OrderPosition, type Stored, type TechnicalCondition } from '@miracle/types';
import { brandJobId, defineJob, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { submitOnce, pollUntilDone } from '../../../common/cloud-job.js';
import { countTokens } from '../../../common/count-tokens.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { DesignationsService } from '../../../orders/designations.service.js';
import { TechnicalConditionsService } from '../../../technical-conditions/technical-conditions.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';

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

function formatRequirements(position: Stored<OrderPosition>): string {
    const productTypeLine =
        position.productTypeId && position.productTypeName
            ? `Тип продукции: ${position.productTypeName} (id: ${position.productTypeId})`
            : 'Тип продукции: не указан';

    const requirements = position.data.requirements?.trim();
    if (!requirements) {
        throw new Error('У позиции нет требований — сначала запустите анализ заявки');
    }

    return ['=== ТРЕБОВАНИЯ ЗАКАЗЧИКА ===', '', productTypeLine, '', 'Требования:', requirements].join('\n');
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

type DesignationAnalyseInput = { positionId: string; tcId: string };
type DesignationMid = { positionId: string; tcId: string; values: DesignationResult['values'] };

/**
 * Корневой джоб `designation-analyse`: позиция + ТУ → условное обозначение.
 * Дети: `llm` (opId под `memo`; output — значения слотов) → `apply` (пишет `position.designation`).
 */
@Injectable()
@JobImpl()
export class DesignationAnalyseJob implements Job<DesignationAnalyseInput, void> {
    readonly id = brandJobId('designation-analyse');
    run!: Job<DesignationAnalyseInput, void>['run'];

    constructor(
        positions: OrderPositionsService,
        designations: DesignationsService,
        tc: TechnicalConditionsService,
        yandex: YandexService,
    ) {
        const llm = defineJob(
            'designation-analyse:llm',
            (input: DesignationAnalyseInput): Effect.Effect<DesignationMid, unknown, JobEnv> =>
                Effect.gen(function* () {
                    const position = yield* Effect.promise(() => positions.get(input.positionId));
                    if (!position) return yield* Effect.fail(new Error(`Позиция "${input.positionId}" не найдена`));
                    const condition = yield* Effect.promise(() => tc.getById(input.tcId));
                    if (!condition) return yield* Effect.fail(new Error(`TC "${input.tcId}" не найдено`));

                    const userMessage = [formatRequirements(position), prepareDesignationSlotsPayload(condition)].join('\n\n');
                    const opId = yield* submitOnce(
                        () =>
                            yandex.submitCompletion({
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
                        yandex.pollCompletionJson(opId, DesignationResultZodSchema),
                    );
                    return { positionId: input.positionId, tcId: input.tcId, values: result.values };
                }),
        );

        const apply = defineJob('designation-analyse:apply', (input: DesignationMid) =>
            Effect.promise(() => designations.upsert(input.positionId, input.tcId, input.values)).pipe(Effect.asVoid),
        );

        this.run = (input: DesignationAnalyseInput) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const mid = yield* jobs.run(llm, [jobs.runId, 'llm'], input);
                yield* jobs.run(apply, [jobs.runId, 'apply'], mid);
            });
    }
}
