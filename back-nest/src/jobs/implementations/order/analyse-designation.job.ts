import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { z } from 'zod';
import { type OrderPosition, type Stored, type TechnicalCondition } from '@miracle/types';
import { brandJobId, defineJob, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { submitOnce, pollUntilDone } from '../../../common/cloud-job.js';
import { countTokens } from '../../../common/count-tokens.js';
import { tryLabeledPromise, wrapUnknown } from '../../../common/effect-errors.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { DesignationsService } from '../../../orders/designations.service.js';
import { TechnicalConditionsService } from '../../../technical-conditions/technical-conditions.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';

const DesignationResultZodSchema = z.object({
    values: z
        .array(
            z.object({
                slotIndex: z.number().describe('Индекс SlotRule.index из переданного списка'),
                value: z.string().nullable().describe('Значение строго из вариантов правил ТУ; null если не определимо'),
                confidence: z.number().min(0).max(1).describe('Уверенность 0..1'),
                reasoning: z.string().describe('1–2 фразы обоснования; для null — чего не хватило'),
            }),
        )
        .describe('По одному элементу на каждый переданный SlotRule'),
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

    const requirements = (position.data.requirements ?? []).map((line) => line.trim()).filter(Boolean);
    if (requirements.length === 0) {
        throw new Error('У позиции нет требований — обозначение не определить');
    }

    return [
        '=== ТРЕБОВАНИЯ ЗАКАЗЧИКА ===',
        '',
        productTypeLine,
        '',
        'Требования:',
        ...requirements.map((line) => `- ${line}`),
    ].join('\n');
}

function prepareSlotRulesPayload(tc: Stored<TechnicalCondition>): string {
    const slotRules = tc.slotRules ?? [];
    if (slotRules.length === 0) {
        throw new Error('У ТУ не заданы правила слотов (slotRules пусто)');
    }

    const ordered = [...slotRules].sort((a, b) => a.index - b.index);

    const blocks = ordered.map((slot) => {
        const rulesText = slot.text.trim() || '(текст правил не задан)';
        return [`Слот №${slot.index} — ${slot.name}`, 'Правила из ТУ:', '---', rulesText, '---'].join('\n');
    });

    return ['=== ПАРАМЕТРЫ ОБОЗНАЧЕНИЯ ===', '', ...blocks].join('\n\n');
}

/** `tcId` необязателен: если не задан — резолвится по типу продукции позиции (см. гейты ниже). */
type AnalyseDesignationInput = { positionId: string; tcId?: string };
type DesignationMid = { positionId: string; tcId: string; values: DesignationResult['values'] };

/**
 * Корневой джоб `analyse-designation`: позиция (+ ТУ) → условное обозначение.
 * Дети: `llm` (opId под `memo`; output — значения слотов) → `apply` (пишет обозначение позиции).
 *
 * ТУ резолвится ВНУТРИ джоба и здесь же — гейты: джоб бросает осмысленную ошибку при отсутствии
 * типа продукции / пустых требованиях / отсутствии ТУ / неоднозначном выборе (>1 ТУ на тип).
 * Вызывающий (`analyse-order`) ловит эти ошибки пер-позиция и продолжает остальные.
 */
@Injectable()
@JobImpl()
export class AnalyseDesignationJob implements Job<AnalyseDesignationInput, void> {
    readonly id = brandJobId('analyse-designation');
    run!: Job<AnalyseDesignationInput, void>['run'];

    constructor(
        positions: OrderPositionsService,
        designations: DesignationsService,
        tc: TechnicalConditionsService,
        yandex: YandexService,
    ) {
        const llm = defineJob(
            'analyse-designation:llm',
            (input: AnalyseDesignationInput): Effect.Effect<DesignationMid, unknown, JobEnv> =>
                Effect.gen(function* () {
                    const position = yield* tryLabeledPromise(`загрузка позиции "${input.positionId}"`, () =>
                        positions.get(input.positionId),
                    );
                    if (!position) return yield* Effect.fail(new Error(`Позиция "${input.positionId}" не найдена`));
                    if (!position.productTypeId) {
                        return yield* Effect.fail(new Error('У позиции не определён тип продукции — обозначение невозможно'));
                    }

                    // Резолв ТУ: явный tcId важнее; иначе по типу продукции с гейтами 0 / >1.
                    let tcId = input.tcId;
                    if (!tcId) {
                        const list = yield* tryLabeledPromise(
                            `загрузка ТУ для типа продукции "${position.productTypeId}"`,
                            () => tc.getByProductTypeId(position.productTypeId!),
                        );
                        if (list.length === 0) {
                            return yield* Effect.fail(new Error(`Для типа "${position.productTypeId}" нет ТУ`));
                        }
                        if (list.length > 1) {
                            return yield* Effect.fail(
                                new Error(`Для типа "${position.productTypeId}" несколько ТУ — выбор неоднозначен`),
                            );
                        }
                        tcId = list[0].id;
                    }

                    const condition = yield* tryLabeledPromise(`загрузка ТУ "${tcId}"`, () => tc.getById(tcId!));
                    if (!condition) return yield* Effect.fail(new Error(`ТУ "${tcId}" не найдено`));

                    const userMessage = yield* Effect.try({
                        try: () => [formatRequirements(position), prepareSlotRulesPayload(condition)].join('\n\n'),
                        catch: wrapUnknown(`prepare designation prompt for position "${input.positionId}"`),
                    });
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
                        {
                            label: `analyse designation submit; position=${input.positionId}; tc=${tcId}`,
                            extraMemo: { finalPrompt: { system: DESIGNATION_PROMPT, user: userMessage } },
                        },
                    );
                    const result = yield* pollUntilDone<DesignationResult>(
                        () => yandex.pollCompletionJson(opId, DesignationResultZodSchema),
                        { label: `analyse designation poll; opId=${opId}` },
                    );
                    return { positionId: input.positionId, tcId: tcId!, values: result.values };
                }).pipe(
                    Effect.mapError(
                        (error) =>
                            new Error(`Не удалось определить условное обозначение позиции "${input.positionId}"`, {
                                cause: error,
                            }),
                    ),
                ),
        );

        const apply = defineJob('analyse-designation:apply', (input: DesignationMid) =>
            tryLabeledPromise(`сохранение обозначения для позиции "${input.positionId}"`, () =>
                designations.upsert(input.positionId, input.tcId, input.values),
            ).pipe(
                Effect.asVoid,
                Effect.mapError(
                    (error) =>
                        new Error(`Не удалось записать условное обозначение позиции "${input.positionId}"`, {
                            cause: error,
                        }),
                ),
            ),
        );

        this.run = (input: AnalyseDesignationInput) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const mid = yield* jobs.run(llm, [jobs.runId, 'llm'], input);
                yield* jobs.run(apply, [jobs.runId, 'apply'], mid);
            });
    }
}
