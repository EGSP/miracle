import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { FileDomain, getFileDomain } from '@miracle/types';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import { runFanout, decideFanout } from '../../framework/fanout.js';
import { JobPartialError } from '../../framework/runtime.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import { ApplicationChunkReader } from '../../../orders/application-chunk-reader.js';
import { FilesService } from '../../../files/files.service.js';
import { ExtractVisualJob } from './extract-visual.job.js';
import { ExtractPositionsFromChunkJob } from './extract-positions-from-chunk.job.js';

type AnalyseApplicationInput = { applicationId: string };

/**
 * Джоб `analyse-application`: одно приложение заказа → позиции.
 *
 * Для VISUAL-файлов (pdf/изображение) сначала дочерним `extract-visual` обеспечивает извлечение
 * содержимого (идемпотентно, кэш в FileContent) — это и есть «извлечение внутри пайплайна заказа».
 * Документы/текст/таблицы читаются ридером инлайн без отдельного шага. Затем читает приложение
 * через {@link ApplicationChunkReader} и веером запускает `extract-positions-from-chunk` по чанкам.
 *
 * Веер чанков — best-effort со сводом ({@link decideFanout}): упавший чанк не валит остальные;
 * все чанки упали → приложение `failed`, часть → `partial`, все ок → `succeeded`. Предусловия же
 * (загрузка заявки/файла, `extract-visual`, чтение чанков) остаются fail-fast — без них веера нет.
 */
@Injectable()
@JobImpl()
export class AnalyseApplicationJob implements Job<AnalyseApplicationInput, void> {
    readonly id = brandJobId('analyse-application');
    run!: Job<AnalyseApplicationInput, void>['run'];

    constructor(
        applications: OrderApplicationsService,
        files: FilesService,
        reader: ApplicationChunkReader,
        extractVisual: ExtractVisualJob,
        extract: ExtractPositionsFromChunkJob,
    ) {
        this.run = (input: AnalyseApplicationInput): Effect.Effect<void, unknown, JobEnv> =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const application = yield* tryLabeledPromise(`загрузка заявки "${input.applicationId}"`, () =>
                    applications.get(input.applicationId),
                );
                if (!application) {
                    return yield* Effect.fail(new Error(`Приложение "${input.applicationId}" не найдено`));
                }

                // VISUAL-файл: извлечь содержимое прямо в пайплайне (дочерний awaited-джоб, идемпотентно).
                if (application.data.type === 'file') {
                    const fileId = application.data.fileId;
                    const file = yield* tryLabeledPromise(`загрузка файла заявки "${fileId}"`, () => files.get(fileId));
                    if (file && getFileDomain(file.extension ?? '') === FileDomain.VISUAL) {
                        yield* jobs.run(extractVisual, [jobs.runId, 'extract-visual', fileId], { fileId });
                    }
                }

                const chunks = yield* tryLabeledPromise(`чтение чанков заявки "${input.applicationId}"`, () =>
                    reader.read(application),
                );
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
                    // Сигнал `partial` нельзя терять под обёрткой — иначе узел покрасится в `failed`.
                    error instanceof JobPartialError
                        ? error
                        : new Error(`Не удалось проанализировать приложение "${input.applicationId}"`, { cause: error }),
                ),
            );
    }
}
