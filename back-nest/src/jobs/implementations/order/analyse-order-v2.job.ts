import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import type { OrderPosition, Stored } from '@miracle/types';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs, Progress } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import { withTokensUsageScope } from '../../../common/tokens-usage.js';
import { Swarm } from '../../framework/swarm.js';
import { decideFanout } from '../../framework/fanout.js';
import { JobPartialError } from '../../framework/runtime.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { TechnicalConditionsService } from '../../../technical-conditions/technical-conditions.service.js';
import { AnalyseApplicationJob } from './analyse-application.job.js';
import { AnalyseGroupDesignationJob } from './analyse-group-designation.job.js';
import { splitGroupByTokenBudget, type PositionGroup } from './designation-grouping.js';
import { GROUP_CONCURRENCY, GROUP_TOKEN_BUDGET } from './analyse-order-v2.constants.js';

type AnalyseOrderV2Input = { orderId: string };

/** Проблема группировки: тип продукции без однозначного ТУ (0 или >1). Падает как ошибка своей группы. */
type GroupingProblem = { readonly productTypeName: string; readonly reason: string };

/** Элемент этапа обозначений: либо готовая группа, либо проблема группировки (детерминированный порядок). */
type DesignationItem =
    | { readonly kind: 'group'; readonly group: PositionGroup }
    | { readonly kind: 'problem'; readonly problem: GroupingProblem };

/**
 * Корневой джоб `analyse-order-v2` — вторая версия алгоритма (см. README в этой папке).
 *
 * Этап 1 (чтение, с переиспользованием): по приложениям, у которых ЕЩЁ НЕТ позиций, запускается
 * `analyse-application` со стабильным ключом. Приложения с уже извлечёнными позициями
 * переиспользуются без LLM — это и есть «не платить за выведение позиций дважды».
 *
 * Этап 2–3 (обозначения): позиции с типом продукции группируются по ТУ (тип → ровно одно ТУ;
 * иначе — проблема группировки), большие группы режутся на подгруппы по бюджету токенов. Группы
 * обходятся последовательно (ограничения Яндекса); внутри группы — пошагово по слотам с записью в
 * реальном времени (`analyse-group-designation`).
 *
 * Свод исхода — общий по обоим этапам ({@link decideFanout}): часть упала → `partial`, всё упало →
 * `failed`, иначе `succeed`. Деструктив переанализа живёт на триггер-слое; тело replay-safe.
 * Запускать со стабильным ключом `['analyse-order-v2', orderId]`.
 */
@Injectable()
@JobImpl()
export class AnalyseOrderV2Job implements Job<AnalyseOrderV2Input, void> {
    readonly id = brandJobId('analyse-order-v2');
    run!: Job<AnalyseOrderV2Input, void>['run'];

    constructor(
        applications: OrderApplicationsService,
        positions: OrderPositionsService,
        tc: TechnicalConditionsService,
        analyseApplication: AnalyseApplicationJob,
        analyseGroup: AnalyseGroupDesignationJob,
    ) {
        this.run = (input: AnalyseOrderV2Input): Effect.Effect<void, unknown, JobEnv> =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const progress = yield* Progress;

                // ── Этап 1: чтение приложений → позиции, с переиспользованием готовых ──────
                yield* progress.push(0, { label: 'загрузка приложений' });

                const apps = yield* tryLabeledPromise(`получение заявок заказа "${input.orderId}"`, () =>
                    applications.listByOrder(input.orderId),
                );

                const existingByApp = yield* tryLabeledPromise('проверка уже извлечённых позиций', () =>
                    Promise.all(apps.map((app) => positions.listByApplication(app.id))),
                );
                // Переизвлекаем только приложения без позиций; остальные — переиспользуем (без LLM).
                const toExtract = apps.filter((_, index) => existingByApp[index].length === 0);

                yield* progress.push(0.1, { label: 'извлечение позиций', determined: false });
                const appResults = (yield* Swarm.run(
                    toExtract,
                    (app) => jobs.run(analyseApplication, ['analyse-application', app.id], { applicationId: app.id }),
                    { label: `анализ приложений заказа "${input.orderId}"`, failureMode: 'bestEffort' },
                )).results;

                // ── Этап 2: группировка позиций с типом продукции по ТУ ───────────────────
                yield* progress.push(0.4, { label: 'группировка позиций' });

                const positionLists = yield* tryLabeledPromise('загрузка позиций заказа', () =>
                    Promise.all(apps.map((app) => positions.listByApplication(app.id))),
                );
                const targets = positionLists.flat().filter((position) => position.productTypeId);

                const items = yield* buildDesignationItems(targets, (productTypeId) =>
                    tc.getByProductTypeId(productTypeId),
                );

                // ── Этап 3: обозначения по группам, последовательно (см. тумблер GROUP_CONCURRENCY) ─
                yield* progress.push(0.5, { label: 'определение обозначений', determined: false });

                const designationResults = (yield* Swarm.run(
                    items,
                    (item, index) =>
                        item.kind === 'group'
                            ? jobs.run(analyseGroup, [jobs.runId, 'group', String(index)], {
                                  tcId: item.group.tcId,
                                  positionIds: item.group.positionIds,
                              })
                            : Effect.fail(
                                  new Error(
                                      `Тип продукции "${item.problem.productTypeName}": ${item.problem.reason}`,
                                  ),
                              ),
                    {
                        label: `обозначения заказа "${input.orderId}"`,
                        failureMode: 'bestEffort',
                        concurrency: GROUP_CONCURRENCY ?? 1,
                    },
                )).results;

                // ── Общий свод по обоим этапам → succeed / partial / failed ────────────────
                yield* decideFanout(`анализ заказа v2 "${input.orderId}"`, [...appResults, ...designationResults]);
            }).pipe(
                Effect.mapError((error) =>
                    error instanceof JobPartialError
                        ? error
                        : new Error(`Не удалось проанализировать заказ "${input.orderId}" (v2)`, { cause: error }),
                ),
                // Корень кладёт orderId в ambient-теги — наследуется всеми дочерними джобами/тулами и
                // доезжает до ledger расхода токенов в YandexService.
                withTokensUsageScope({ orderId: input.orderId }),
            );
    }
}

/**
 * Строит детерминированный список элементов этапа обозначений: резолвит ТУ по типу продукции
 * (ровно одно ТУ → группа; 0 или >1 → проблема) и режет группы на подгруппы по бюджету токенов.
 * Порядок типов фиксируется сортировкой их id — это часть стабильности при возобновлении.
 */
function buildDesignationItems(
    targets: Stored<OrderPosition>[],
    resolveTcs: (productTypeId: string) => Promise<{ id: string }[]>,
): Effect.Effect<DesignationItem[], unknown> {
    return Effect.gen(function* () {
        const byType = new Map<string, Stored<OrderPosition>[]>();
        for (const position of targets) {
            const list = byType.get(position.productTypeId!) ?? [];
            list.push(position);
            byType.set(position.productTypeId!, list);
        }

        const productTypeIds = [...byType.keys()].sort();
        const items: DesignationItem[] = [];
        for (const productTypeId of productTypeIds) {
            const typePositions = byType.get(productTypeId)!;
            const productTypeName = typePositions[0]?.productTypeName ?? productTypeId;

            const tcs = yield* tryLabeledPromise(`резолв ТУ для типа "${productTypeId}"`, () =>
                resolveTcs(productTypeId),
            );
            if (tcs.length === 0) {
                items.push({ kind: 'problem', problem: { productTypeName, reason: 'нет ТУ' } });
                continue;
            }
            if (tcs.length > 1) {
                items.push({
                    kind: 'problem',
                    problem: { productTypeName, reason: 'несколько ТУ — выбор неоднозначен' },
                });
                continue;
            }

            for (const group of splitGroupByTokenBudget(tcs[0].id, typePositions, GROUP_TOKEN_BUDGET)) {
                items.push({ kind: 'group', group });
            }
        }
        return items;
    });
}
