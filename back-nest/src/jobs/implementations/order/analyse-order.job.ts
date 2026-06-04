import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { formatUnknown, tryLabeledPromise } from '../../../common/effect-errors.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { AnalyseApplicationJob } from './analyse-application.job.js';
import { AnalyseDesignationJob } from './analyse-designation.job.js';

type AnalyseOrderInput = { orderId: string };

/**
 * Корневой джоб `analyse-order`: оркестрация анализа заказа в два этапа.
 *
 * Этап 1 — чтение: параллельно по приложениям заказа запускается `analyse-application`
 * (каждое в best-effort: упавшее приложение пропускается, заказ идёт дальше). Этап завершается
 * `Effect.all` — это и есть БАРЬЕР: дальше идём, только когда все приложения прочитаны и позиции в БД.
 *
 * Этап 2 — обозначения: параллельно по позициям с определённым типом продукции запускается
 * `analyse-designation` (тоже best-effort; резолв ТУ и гейты — внутри самой джобы).
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

                // ── Этап 1: чтение приложений → позиции ──────────────────────────────────
                const apps = yield* tryLabeledPromise(`получение списка заявок заказа "${input.orderId}"`, () =>
                    applications.listByOrder(input.orderId),
                );
                yield* Effect.all(
                    apps.map((app) =>
                        jobs
                            .run(analyseApplication, [jobs.runId, 'app', app.id], { applicationId: app.id })
                            .pipe(
                                Effect.catchAll((error) =>
                                    Effect.logWarning(`analyse-application "${app.id}" пропущено: ${formatUnknown(error)}`),
                                ),
                            ),
                    ),
                    { concurrency: 'unbounded' },
                );

                // ── Барьер пройден: все позиции заказа записаны ──────────────────────────
                const positionLists = yield* tryLabeledPromise(
                    `получение списка позиций проанализированных заявок заказа "${input.orderId}"`,
                    () => Promise.all(apps.map((app) => positions.listByApplication(app.id))),
                );
                const targets = positionLists.flat().filter((p) => p.productTypeId);

                // ── Этап 2: условные обозначения по позициям с типом продукции ───────────
                yield* Effect.all(
                    targets.map((position) =>
                        jobs
                            .run(analyseDesignation, [jobs.runId, 'designation', position.id], { positionId: position.id })
                            .pipe(
                                Effect.catchAll((error) =>
                                    Effect.logWarning(`analyse-designation "${position.id}" пропущено: ${formatUnknown(error)}`),
                                ),
                            ),
                    ),
                    { concurrency: 'unbounded' },
                );
            }).pipe(
                Effect.mapError(
                    (error) => new Error(`Не удалось проанализировать заказ "${input.orderId}"`, { cause: error }),
                ),
            );
    }
}
