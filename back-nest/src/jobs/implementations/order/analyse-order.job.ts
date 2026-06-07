import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs, Progress } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import { runFanout, decideFanout } from '../../framework/fanout.js';
import { JobPartialError } from '../../framework/runtime.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { AnalyseApplicationJob } from './analyse-application.job.js';
import { AnalyseDesignationJob } from './analyse-designation.job.js';

type AnalyseOrderInput = { orderId: string };

/**
 * Корневой джоб `analyse-order`: оркестрация анализа заказа в два этапа.
 *
 * Этап 1 — чтение: параллельно по приложениям заказа запускается `analyse-application` в режиме
 * best-effort (упавшее приложение НЕ валит остальные). `runFanout` дожидается всех — это БАРЬЕР:
 * дальше идём, только когда все приложения отработали и позиции успешных в БД.
 *
 * Этап 2 — обозначения: параллельно по позициям с типом продукции запускается `analyse-designation`
 * (тоже best-effort; резолв ТУ и гейты — внутри самой джобы).
 *
 * Свод исхода — общий по обоим этапам ({@link decideFanout}): все дочерние операции упали → заказ
 * `failed`; часть упала → `partial`; все успешны (или их нет) → `succeed`.
 *
 * Тело — чистая оркестрация (replay-safe): деструктивные операции (снос прежних позиций/прогонов
 * при переанализе) живут на триггер-слое, а не здесь. Запускать с ключом `['analyse-order', orderId]`.
 */
@Injectable()
@JobImpl()
export class AnalyseOrderJob implements Job<AnalyseOrderInput, void> {
    readonly id = brandJobId('analyse-order');
    run!: Job<AnalyseOrderInput, void>['run'];

    constructor(
        applications: OrderApplicationsService,
        positions: OrderPositionsService,
        analyseApplication: AnalyseApplicationJob,
        analyseDesignation: AnalyseDesignationJob,
    ) {
        this.run = (input: AnalyseOrderInput): Effect.Effect<void, unknown, JobEnv> =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const progress = yield* Progress;

                // ── Этап 1: чтение приложений → позиции (best-effort, барьер) ─────────────
                yield* progress.push(0, { label: 'загрузка приложений' });

                const apps = yield* tryLabeledPromise(`получение списка заявок заказа "${input.orderId}"`, () =>
                    applications.listByOrder(input.orderId),
                );
                yield* progress.push(0.1, { label: 'анализ приложений', determined: false });

                const appResults = yield* runFanout(
                    apps.map((app) =>
                        jobs.run(analyseApplication, [jobs.runId, 'app', app.id], { applicationId: app.id }),
                    ),
                );

                // ── Барьер пройден: позиции успешных приложений записаны ──────────────────
                yield* progress.push(0.5, { label: 'загрузка позиций' });

                const positionLists = yield* tryLabeledPromise(
                    `получение списка позиций проанализированных заявок заказа "${input.orderId}"`,
                    () => Promise.all(apps.map((app) => positions.listByApplication(app.id))),
                );
                const targets = positionLists.flat().filter((p) => p.productTypeId);

                // ── Этап 2: условные обозначения по позициям с типом продукции (best-effort) ─
                yield* progress.push(0.5, { label: 'определение обозначений', determined: false });

                const designationResults = yield* runFanout(
                    targets.map((position) =>
                        jobs.run(analyseDesignation, [jobs.runId, 'designation', position.id], {
                            positionId: position.id,
                        }),
                    ),
                );

                // ── Общий свод по обоим этапам → succeed / partial / failed ────────────
                yield* decideFanout(`анализ заказа "${input.orderId}"`, [...appResults, ...designationResults]);
            }).pipe(
                Effect.mapError((error) =>
                    // Сигнал `partial` нельзя терять под обёрткой — иначе узел покрасится в `failed`.
                    error instanceof JobPartialError
                        ? error
                        : new Error(`Не удалось проанализировать заказ "${input.orderId}"`, { cause: error }),
                ),
            );
    }
}
