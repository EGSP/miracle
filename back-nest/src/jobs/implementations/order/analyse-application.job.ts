import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import { ApplicationChunkReader } from '../../../orders/application-chunk-reader.js';
import { ExtractPositionsFromChunkJob } from './extract-positions-from-chunk.job.js';

type AnalyseApplicationInput = { applicationId: string };

/**
 * Джоб `analyse-application`: одно приложение заказа → позиции.
 * Читает приложение через {@link ApplicationChunkReader} (гибрид-роутер: текст / таблица напрямую /
 * FileContent) и веером запускает `extract-positions-from-chunk` по каждому чанку.
 *
 * Веер — обычный `Effect.all` (fail-fast): падение любого чанка валит ВСЁ приложение. Это намеренно —
 * родитель (`analyse-order`) ловит падение приложения и продолжает остальные.
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
                const application = yield* Effect.promise(() => applications.get(input.applicationId));
                if (!application) {
                    return yield* Effect.fail(new Error(`Приложение "${input.applicationId}" не найдено`));
                }

                const chunks = yield* Effect.promise(() => reader.read(application));
                yield* Effect.all(
                    chunks.map((c) =>
                        jobs.run(extract, [jobs.runId, 'chunk', c.chunkKey], {
                            applicationId: input.applicationId,
                            chunk: c.chunk,
                            chunkKey: c.chunkKey,
                        }),
                    ),
                    { concurrency: 'unbounded' },
                );
            });
    }
}
