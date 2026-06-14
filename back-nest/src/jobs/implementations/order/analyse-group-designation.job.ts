import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import type { OrderPosition, Stored } from '@miracle/types';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { JobTools, Progress } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { DesignationsService } from '../../../orders/designations.service.js';
import { TechnicalConditionsService } from '../../../technical-conditions/technical-conditions.service.js';
import { sortPositionsById } from './designation-grouping.js';
import { DesignationSlotTool, type DesignationSlotPosition } from './tools/designation-slot.tool.js';

/** Вход группа-джоба: ТУ и позиции группы. Локальные индексы восстанавливаются сортировкой по id. */
export type AnalyseGroupDesignationInput = {
    readonly tcId: string;
    readonly positionIds: string[];
};

/**
 * Джоб `analyse-group-designation`: пошаговый анализ условного обозначения для ГРУППЫ позиций одного ТУ.
 *
 * Слоты ТУ обходятся по порядку индекса, по одному за запрос (см. README, этап 3). На каждый слот
 * один LLM-вызов через {@link DesignationSlotTool} (правило слота + примеры + все позиции группы),
 * затем результат каждой позиции сразу пишется точечно в базу ({@link DesignationsService.patchSlot}) —
 * обозначение собирается в реальном времени.
 *
 * Возобновляемость: каждый слот — отдельный вызов инструмента с durable-памятью (submit-once `opId`),
 * запись слота идемпотентна. Соответствие «локальный индекс → id позиции» не хранится, а
 * восстанавливается детерминированной сортировкой позиций по id.
 */
@Injectable()
@JobImpl()
export class AnalyseGroupDesignationJob implements Job<AnalyseGroupDesignationInput, void> {
    readonly id = brandJobId('analyse-group-designation');
    run!: Job<AnalyseGroupDesignationInput, void>['run'];

    constructor(
        positions: OrderPositionsService,
        designations: DesignationsService,
        tc: TechnicalConditionsService,
        slotTool: DesignationSlotTool,
    ) {
        this.run = (input: AnalyseGroupDesignationInput): Effect.Effect<void, unknown, JobEnv> =>
            Effect.gen(function* () {
                const progress = yield* Progress;
                const tools = yield* JobTools;
                yield* progress.push(0, { label: 'загрузка данных группы' });

                const condition = yield* tryLabeledPromise(`загрузка ТУ "${input.tcId}"`, () => tc.getById(input.tcId));
                if (!condition) {
                    return yield* Effect.fail(new Error(`ТУ "${input.tcId}" не найдено`));
                }

                const slotRules = [...(condition.slotRules ?? [])].sort((a, b) => a.index - b.index);
                if (slotRules.length === 0) {
                    return yield* Effect.fail(new Error(`У ТУ "${input.tcId}" не заданы правила слотов`));
                }

                // Загрузка позиций группы и детерминированный порядок → локальные индексы.
                const loaded = yield* tryLabeledPromise('загрузка позиций группы', () =>
                    Promise.all(input.positionIds.map((id) => positions.get(id))),
                );
                const ordered = sortPositionsById(
                    loaded.filter((position): position is Stored<OrderPosition> => position !== null),
                );
                if (ordered.length === 0) {
                    return yield* Effect.fail(new Error('В группе нет существующих позиций'));
                }

                const slotPayload: DesignationSlotPosition[] = ordered.map((position, localIndex) => ({
                    localIndex,
                    name: position.name,
                    requirements: position.data.requirements ?? [],
                }));
                const decodeExamples = condition.designationDecodeExamples?.trim() || null;

                // Пошаговый обход слотов — последовательно (ограничения Яндекса; см. README, тумблеры).
                for (const [slotPosition, slot] of slotRules.entries()) {
                    yield* progress.push((slotPosition + 1) / (slotRules.length + 1), {
                        label: `слот №${slot.index} — ${slot.name}`,
                        determined: false,
                    });

                    const values = yield* tools.run(
                        slotTool,
                        {
                            tcId: input.tcId,
                            slotIndex: slot.index,
                            slotName: slot.name,
                            slotRuleText: slot.text,
                            decodeExamples,
                            positions: slotPayload,
                        },
                        { key: ['slot', String(slot.index)] },
                    );

                    // Маппинг локального индекса обратно на позицию + точечная идемпотентная запись.
                    for (const value of values) {
                        const position = ordered[value.localIndex];
                        if (!position) {
                            continue; // защита от некорректного localIndex из ответа модели
                        }
                        yield* tryLabeledPromise(
                            `запись слота №${slot.index} позиции "${position.id}"`,
                            () =>
                                designations.patchSlot(position.id, input.tcId, {
                                    slotIndex: slot.index,
                                    value: value.value,
                                    confidence: value.confidence,
                                    reasoning: value.reasoning,
                                }),
                        );
                    }
                }

                yield* progress.push(1, { label: 'обозначения группы записаны' });
            }).pipe(
                Effect.asVoid,
                Effect.mapError(
                    (error) =>
                        new Error(`Не удалось проанализировать группу ТУ "${input.tcId}"`, { cause: error }),
                ),
            );
    }
}
