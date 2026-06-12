import { Effect } from 'effect';
import {
    ExtractionStatus,
    type ExtractionType,
    type Content,
    type FileModel,
    type Stored,
} from '@miracle/types';
import { defineJob, type Job, type JobEnv } from '../../framework/job.js';
import { Jobs, Memo, Progress } from '../../framework/context.js';
import { submitOnceEffect, pollUntilDoneEffect } from '../../../common/cloud-job.js';
import { formatUnknown, tryLabeledPromise } from '../../../common/effect-errors.js';
import type { FilesService } from '../../../files/files.service.js';
import type { FilesContentService } from '../../../files-content/files-content.service.js';
import { YANDEX_MODELS, YandexInput, type YandexService } from '../../../yandex/yandex.service.js';
import type { ConvertService } from '../../../convert/convert.service.js';
import {
    LLM_VISION_PROMPT,
    LLM_VISION_USER,
} from '../../../document-prepare/vision/prompts.js';
import { renderVisionPages } from '../../../document-prepare/vision/render-pages.js';

export { LLM_VISION_PROMPT, LLM_VISION_USER };

/**
 * Общая «начинка» scan-джобов (OCR / LLM Vision / LLM Vision ТУ). Сами джобы — отдельные
 * инъецируемые классы (по файлу на джоб); здесь — промпты, чтение файла, рендер страниц и
 * сборка детей `recognize`/`apply`, чтобы три класса не дублировали логику.
 */

export const TC_VISION_PROMPT = `Ты — ассистент для извлечения содержимого из документов Технических Условий (ТУ).
Тебе передаются страницы PDF в виде изображений.

Извлеки весь текст документа с сохранением структуры:
- Заголовки разделов и подразделов с исходной нумерацией из ТУ
- Обычный текст — дословно, в порядке следования в документе
- Таблицы — в формате markdown-таблиц с сохранением всех строк, столбцов и заголовков
- Списки и перечисления — с сохранением маркировки и уровней вложенности
- Формулы, обозначения, единицы измерения — без интерпретации и перефразирования

Особое внимание:
- Таблицы технических условий (параметры, допустимые значения, коды обозначений) — извлекай полностью
- Сохраняй связь между номером пункта ТУ и его содержанием
- Не пропускай текст мелким шрифтом, сноски, примечания к таблицам

Не добавляй комментариев, пояснений и интерпретаций от себя.
Верни единый связный текст документа в формате markdown.`;

export const TC_VISION_USER = 'Извлеки содержимое документа Технических Условий.';

const errMessage = (error: unknown): string => formatUnknown(error);

/** Вход scan-джоба. */
export type ScanInput = { fileId: string; fileContentId: string };

/** Результат распознавания, проносимый из дочернего `recognize` в дочерний `apply`. */
export type ScanResult = {
    fileId: string;
    fileContentId: string;
    content: Content[];
    extractionType: ExtractionType;
};

/** Эффект распознавания: облачный вызов (opId под `memo`) → массив `Content`. */
export type ScanRecognize = (input: ScanInput) => Effect.Effect<Content[], unknown, JobEnv>;

type FilesDep = Pick<FilesService, 'get' | 'getFilePath'>;
type FilesContentDep = Pick<FilesContentService, 'update'>;
type YandexDep = Pick<
    YandexService,
    'createResponse' | 'retrieveResponse'
>;
type ConvertDep = Pick<ConvertService, 'pdfToImages'>;

const requireFile = (files: FilesDep, fileId: string): Effect.Effect<Stored<FileModel>, Error> =>
    tryLabeledPromise(`загрузка файла "${fileId}"`, () => files.get(fileId)).pipe(
        Effect.flatMap((file) =>
            file ? Effect.succeed(file) : Effect.fail(new Error(`Файл "${fileId}" не найден`)),
        ),
    );

const renderPages = (files: FilesDep, convert: ConvertDep, file: Stored<FileModel>) =>
    Effect.gen(function* () {
        const filePath = files.getFilePath(file);
        const images = yield* renderVisionPages(convert, file, filePath).pipe(
            Effect.mapError((error) => new Error(error.message)),
        );
        return images;
    });

/** LLM Vision-распознавание: рендер страниц → vision-комплишн (async). */
export const visionRecognize =
    (files: FilesDep, convert: ConvertDep, yandex: YandexDep, systemPrompt: string, userMessage: string): ScanRecognize =>
    (input) =>
        Effect.gen(function* () {
            const progress = yield* Progress;
            yield* progress.push(0, { label: 'чтение файла' });

            const file = yield* requireFile(files, input.fileId);
            if (file.extension.toLowerCase() === 'pdf') {
                yield* progress.push(0.05, { label: 'рендер страниц' });
            }
            const images = yield* renderPages(files, convert, file);
            const opId = yield* submitOnceEffect(
                yandex.createResponse({
                    model: YANDEX_MODELS.vision,
                    instructions: systemPrompt,
                    input: [
                        YandexInput.user([
                            ...images.map((page) => YandexInput.imageDataUrl(page.dataUrl)),
                            YandexInput.text(userMessage),
                        ]),
                    ],
                    maxOutputTokens: 40000,
                }),
                {
                    label: `vision submit; file=${input.fileId}`,
                    submitProgressLabel: 'отправка на распознавание',
                    pollProgressLabel: 'ожидание распознавания',
                },
            );
            const completed = yield* pollUntilDoneEffect(
                yandex.retrieveResponse(opId).pipe(
                    Effect.map((poll) => (poll.done ? { done: true, result: poll } : { done: false })),
                ),
                { label: `vision poll; opId=${opId}` },
            );
            const memo = yield* Memo;
            yield* memo.set('yandexResponse', completed.response);
            return [{ text: completed.outputText }];
        }).pipe(
            Effect.mapError((error) => new Error(`Не удалось распознать файл "${input.fileId}" через Vision`, { cause: error })),
        );

/** Дочерний `recognize`: облачное распознавание; при ошибке метит filesContent FAILED. */
export const buildRecognizeJob = (
    id: string,
    recognize: ScanRecognize,
    filesContent: FilesContentDep,
    extractionType: ExtractionType,
): Job<ScanInput, Content[]> =>
    defineJob(`${id}:recognize`, (input: ScanInput) =>
        recognize(input).pipe(
            Effect.tapError((error) =>
                tryLabeledPromise(`отметка неудачного извлечения для содержимого файла "${input.fileContentId}"`, () =>
                    filesContent.update({
                        id: input.fileContentId,
                        fileId: input.fileId,
                        meta: {
                            extractionType,
                            extractionStatus: ExtractionStatus.FAILED,
                            extractionFailedMessage: errMessage(error),
                        },
                    }),
                ),
            ),
        ),
    );

/** Дочерний `apply`: идемпотентная запись content в filesContent (COMPLETED). */
export const buildApplyJob = (id: string, filesContent: FilesContentDep): Job<ScanResult, void> =>
    defineJob(`${id}:apply`, (result: ScanResult) =>
        Effect.gen(function* () {
            const progress = yield* Progress;
            yield* progress.push(0.9, { label: 'запись содержимого' });

            yield* tryLabeledPromise(`отметка завершённого извлечения для содержимого файла "${result.fileContentId}"`, () =>
                filesContent.update({
                    id: result.fileContentId,
                    fileId: result.fileId,
                    content: result.content,
                    meta: {
                        extractionType: result.extractionType,
                        extractionStatus: ExtractionStatus.COMPLETED,
                    },
                }),
            );
        }).pipe(
            Effect.asVoid,
            Effect.mapError(
                (error) =>
                    new Error(`Не удалось записать результат извлечения файла "${result.fileId}"`, { cause: error }),
            ),
        ),
    );

/** Оркестрация корня: `recognize` (результат в JobRun ребёнка) → `apply`. */
export const buildScanRun =
    (recognizeJob: Job<ScanInput, Content[]>, applyJob: Job<ScanResult, void>, extractionType: ExtractionType) =>
    (input: ScanInput): Effect.Effect<void, unknown, JobEnv> =>
        Effect.gen(function* () {
            const jobs = yield* Jobs;
            const content = yield* jobs.run(recognizeJob, [jobs.runId, 'recognize'], input);
            yield* jobs.run(applyJob, [jobs.runId, 'apply'], {
                fileId: input.fileId,
                fileContentId: input.fileContentId,
                content,
                extractionType,
            } satisfies ScanResult);
        });
