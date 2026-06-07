import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { ExtractionStatus, ExtractionType } from '@miracle/types';
import { brandJobId, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs, Progress } from '../../framework/context.js';
import { tryLabeledPromise } from '../../../common/effect-errors.js';
import { FilesService } from '../../../files/files.service.js';
import { FilesContentService } from '../../../files-content/files-content.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';
import { ConvertService } from '../../../convert/convert.service.js';
import {
    LLM_VISION_PROMPT,
    LLM_VISION_USER,
    buildApplyJob,
    buildRecognizeJob,
    visionRecognize,
} from '../scan/scan.shared.js';

type ExtractVisualInput = { fileId: string };

/**
 * Извлечение содержимого VISUAL-файла (pdf/изображение) через LLM Vision — «новый формат»:
 * запускается как ДОЧЕРНИЙ awaited-джоб пайплайна заказа (а не отдельным корнем fire-and-forget).
 *
 * Идемпотентен: если по файлу уже есть завершённое извлечение (FileContent COMPLETED) — пропускает
 * работу и переиспользует кэш (vision дорог; сбрасывается флагом deleteFileContent при переанализе).
 * Дети: `recognize` (opId под `memo`) → `apply` (пишет FileContent COMPLETED).
 */
@Injectable()
@JobImpl()
export class ExtractVisualJob implements Job<ExtractVisualInput, void> {
    readonly id = brandJobId('extract-visual');
    run!: Job<ExtractVisualInput, void>['run'];

    constructor(
        files: FilesService,
        filesContent: FilesContentService,
        yandex: YandexService,
        convert: ConvertService,
    ) {
        const recognizeJob = buildRecognizeJob(
            'extract-visual',
            visionRecognize(files, convert, yandex, LLM_VISION_PROMPT, LLM_VISION_USER),
            filesContent,
            ExtractionType.LLM,
        );
        const applyJob = buildApplyJob('extract-visual', filesContent);

        this.run = (input: ExtractVisualInput): Effect.Effect<void, unknown, JobEnv> =>
            Effect.gen(function* () {
                const existing = yield* tryLabeledPromise(`загрузка извлечённого содержимого файла "${input.fileId}"`, () =>
                    filesContent.getContent(input.fileId),
                );
                if (existing.some((c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED)) {
                    const progress = yield* Progress;
                    yield* progress.push(1, { label: 'использование кэша' });
                    return;
                }

                const progress = yield* Progress;
                yield* progress.push(0, { label: 'подготовка извлечения' });

                const record = yield* tryLabeledPromise(`создание записи визуального извлечения для файла "${input.fileId}"`, () =>
                    filesContent.create({
                        fileId: input.fileId,
                        meta: { extractionType: ExtractionType.LLM, extractionStatus: ExtractionStatus.STARTED },
                    }),
                );

                const jobs = yield* Jobs;
                const scanInput = { fileId: input.fileId, fileContentId: record.id };
                const content = yield* jobs.run(recognizeJob, [jobs.runId, 'recognize'], scanInput);
                yield* jobs.run(applyJob, [jobs.runId, 'apply'], {
                    fileId: input.fileId,
                    fileContentId: record.id,
                    content,
                    extractionType: ExtractionType.LLM,
                });
            }).pipe(
                Effect.mapError(
                    (error) => new Error(`Не удалось извлечь визуальное содержимое файла "${input.fileId}"`, { cause: error }),
                ),
            );
    }
}
