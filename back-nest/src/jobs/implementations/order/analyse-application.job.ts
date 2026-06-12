import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs, Progress } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import { runFanout, decideFanout } from '../../framework/fanout.js';
import { JobPartialError } from '../../framework/runtime.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import {
    ApplicationChunkReader,
    type ApplicationReadError,
} from '../../../orders/application-chunk-reader.js';
import { ExtractPositionsFromChunkJob } from './extract-positions-from-chunk.job.js';

type AnalyseApplicationInput = { applicationId: string };

/**
 * Джоб `analyse-application`: одно приложение заказа → позиции.
 *
 * Читает приложение через {@link ApplicationChunkReader} (только `PreparedDocument` для файлов;
 * подготовку не запускает — её обеспечивает DPS на upload). Веером запускает
 * `extract-positions-from-chunk` по чанкам.
 *
 * Веер чанков — best-effort ({@link decideFanout}): упавший чанк не валит остальные.
 * Предусловия (заявка, готовый PreparedDocument) — fail-fast.
 */
@Injectable()
@JobImpl()
export class AnalyseApplicationJob implements Job<AnalyseApplicationInput, void> {
    readonly id = brandJobId('analyse-application');
    run!: Job<AnalyseApplicationInput, void>['run'];

    constructor(
        applications: OrderApplicationsService,
        reader: ApplicationChunkReader,
        extract: ExtractPositionsFromChunkJob,
    ) {
        this.run = (input: AnalyseApplicationInput): Effect.Effect<void, unknown, JobEnv> =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const progress = yield* Progress;

                yield* progress.push(0, { label: 'загрузка заявки' });

                const application = yield* tryLabeledPromise(`загрузка заявки "${input.applicationId}"`, () =>
                    applications.get(input.applicationId),
                );
                if (!application) {
                    return yield* Effect.fail(new Error(`Приложение "${input.applicationId}" не найдено`));
                }

                yield* progress.push(0.1, { label: 'чтение чанков' });

                const chunks = yield* reader.read(application).pipe(
                    Effect.mapError(
                        (error: ApplicationReadError) =>
                            new Error(`Не удалось прочитать приложение "${input.applicationId}": ${error.message}`, {
                                cause: error,
                            }),
                    ),
                );
                yield* progress.push(0.2, { label: 'извлечение позиций', determined: false });

                const chunkResults = yield* runFanout(
                    chunks.map((c) =>
                        jobs.run(extract, [jobs.runId, 'chunk', c.chunkKey], {
                            applicationId: input.applicationId,
                            chunk: c.chunk,
                            chunkKey: c.chunkKey,
                        }),
                    ),
                );
                yield* decideFanout(`анализ приложения "${input.applicationId}"`, chunkResults);
            }).pipe(
                Effect.mapError((error) =>
                    error instanceof JobPartialError
                        ? error
                        : new Error(`Не удалось проанализировать приложение "${input.applicationId}"`, {
                              cause: error,
                          }),
                ),
            );
    }
}
