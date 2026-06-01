import fs from 'fs/promises';
import { Effect } from 'effect';
import {
    ExtractionStatus,
    ExtractionType,
    getMimeType,
    validatePageRanges,
    type Content,
    type FileModel,
    type Stored,
} from '@miracle/types';
import type { Memo } from '../jobs/context.js';
import { andThen, named } from '../jobs/combinators.js';
import { leaf, type AnyJob } from '../jobs/job.js';
import { submitOnce, pollUntilDone } from '../common/cloud-job.js';
import type { FilesService } from '../files/files.service.js';
import type { FilesContentService } from './files-content.service.js';
import type { YandexService } from '../yandex/yandex.service.js';
import type { ConvertService } from '../convert/convert.service.js';

/** MIME, поддерживаемые Yandex OCR (async). */
const OCR_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const LLM_VISION_PROMPT = `Ты — ассистент для извлечения содержимого из документов со сложной структурой.
Тебе передаются страницы документа в виде изображений.
Извлеки весь текст и структурированные данные: таблицы, списки, поля форм.

Варианты с отметкой (чекбокс, крестик, галочка, выбор одного из нескольких):
Смотри только на отметку на изображении, не на смысл слов в подписи.

Для каждого варианта в таком блоке — отдельная строка (без символов ☑ ☐ ✓ ✗ [x] и без слов «отмечено», «вариант N»):
  Выбрано: <дословный текст этого варианта из документа>
  Не выбрано: <дословный текст этого варианта из документа>

Правила:
- В одном блоке выбора (одна строка таблицы, один номер пункта, один вопрос) у каждой альтернативы должна быть строка «Выбрано:» или «Не выбрано:». Не оставляй в блоке выбора строк без этих префиксов.
- Если отмечен один из нескольких — у него «Выбрано:», у остальных альтернатив того же блока — «Не выбрано:».
- Если можно отметить несколько — у каждой отмеченной «Выбрано:», у каждой неотмеченной «Не выбрано:».
- Префикс — только статус отметки. Текст после двоеточия копируй из документа как есть, даже если там «без …», «не …» или строка «Не требуется».

Перед вариантами блока можно один раз вывести заголовок из документа (номер пункта, название графы), без префикса.

Остальной текст без отметок — как в документе, в исходном порядке.
Не добавляй комментариев от себя.`;

const LLM_VISION_USER = 'Извлеки содержимое документа.';

const TC_VISION_PROMPT = `Ты — ассистент для извлечения содержимого из документов Технических Условий (ТУ).
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

const TC_VISION_USER = 'Извлеки содержимое документа Технических Условий.';

const errMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** Вход scan-джоба. */
export type ScanInput = { fileId: string; fileContentId: string };

/** Результат распознавания, проносимый в шаг применения. */
type ScanResult = {
    fileId: string;
    fileContentId: string;
    content: Content[];
    extractionType: ExtractionType;
};

export type ScanJobsDeps = {
    files: Pick<FilesService, 'get' | 'getFilePath'>;
    filesContent: Pick<FilesContentService, 'update'>;
    yandex: Pick<
        YandexService,
        'ocrRecognize' | 'ocrPoll' | 'submitVisionCompletion' | 'pollVisionCompletion'
    >;
    convert: Pick<ConvertService, 'pdfToImages'>;
};

/**
 * Строит scan-джобы (OCR / LLM Vision / LLM Vision ТУ), замыкая зависимости (фабрика DI).
 * Каждый джоб = `recognize` (submit→poll, выдаёт content) → `apply` (запись в filesContent COMPLETED).
 * При ошибке `recognize` пишет filesContent FAILED.
 */
export function createScanJobs(deps: ScanJobsDeps): {
    ocr: AnyJob;
    llmVision: AnyJob;
    llmVisionTc: AnyJob;
} {
    const requireFile = (fileId: string): Effect.Effect<Stored<FileModel>, Error> =>
        Effect.promise(() => deps.files.get(fileId)).pipe(
            Effect.flatMap((file) =>
                file ? Effect.succeed(file) : Effect.fail(new Error(`Файл "${fileId}" не найден`)),
            ),
        );

    const renderPages = (file: Stored<FileModel>) =>
        Effect.gen(function* () {
            const filePath = deps.files.getFilePath(file);
            const ext = file.extension.toLowerCase();
            if (ext === 'pdf') {
                const buffer = yield* Effect.promise(() => fs.readFile(filePath));
                const spec = file.settings?.usedPages?.trim();
                let pageNumbers: number[] | undefined;
                if (spec) {
                    const result = validatePageRanges(spec);
                    if (!result.ok) {
                        return yield* Effect.fail(new Error(`Настройка usedPages: ${result.message}`));
                    }
                    pageNumbers = result.pages;
                }
                return yield* Effect.promise(() => deps.convert.pdfToImages(buffer, { scale: 2.5, pageNumbers }));
            }
            const buffer = yield* Effect.promise(() => fs.readFile(filePath));
            const base64 = buffer.toString('base64');
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
            return [{ page: 1, base64, dataUrl: `data:${mimeType};base64,${base64}` }];
        });

    const ocrRecognize = (input: ScanInput): Effect.Effect<Content[], unknown, Memo> =>
        Effect.gen(function* () {
            const file = yield* requireFile(input.fileId);
            const mime = getMimeType(file.extension);
            if (!mime || !OCR_MIME_TYPES.includes(mime)) {
                return yield* Effect.fail(
                    new Error(`Расширение «${file.extension}» не поддерживается Yandex OCR (jpeg/png/pdf)`),
                );
            }
            const bytes = yield* Effect.promise(() => fs.readFile(deps.files.getFilePath(file)));
            const opId = yield* submitOnce(() => deps.yandex.ocrRecognize(mime, bytes));
            return yield* pollUntilDone<Content[]>(() => deps.yandex.ocrPoll(opId));
        });

    const visionRecognize =
        (systemPrompt: string, userMessage: string) =>
        (input: ScanInput): Effect.Effect<Content[], unknown, Memo> =>
            Effect.gen(function* () {
                const file = yield* requireFile(input.fileId);
                const images = yield* renderPages(file);
                const opId = yield* submitOnce(() =>
                    deps.yandex.submitVisionCompletion({
                        instructions: systemPrompt,
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    ...images.map((page) => ({
                                        type: 'input_image' as const,
                                        image_url: page.dataUrl,
                                        detail: 'auto' as const,
                                    })),
                                    { type: 'input_text' as const, text: userMessage },
                                ],
                            },
                        ],
                    }),
                );
                const text = yield* pollUntilDone<string>(() => deps.yandex.pollVisionCompletion(opId));
                return [{ text }];
            });

    const makeScanJob = (
        id: string,
        extractionType: ExtractionType,
        recognize: (input: ScanInput) => Effect.Effect<Content[], unknown, Memo>,
    ): AnyJob => {
        const recognizeLeaf = leaf(`${id}:recognize`, (input: ScanInput) =>
            recognize(input).pipe(
                Effect.map(
                    (content): ScanResult => ({
                        fileId: input.fileId,
                        fileContentId: input.fileContentId,
                        content,
                        extractionType,
                    }),
                ),
                Effect.tapError((error) =>
                    Effect.promise(() =>
                        deps.filesContent.update({
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

        const applyLeaf = leaf(`${id}:apply`, (result: ScanResult) =>
            Effect.promise(() =>
                deps.filesContent.update({
                    id: result.fileContentId,
                    fileId: result.fileId,
                    content: result.content,
                    meta: {
                        extractionType: result.extractionType,
                        extractionStatus: ExtractionStatus.COMPLETED,
                    },
                }),
            ).pipe(Effect.asVoid),
        );

        return recognizeLeaf.pipe(andThen(applyLeaf), named(id));
    };

    return {
        ocr: makeScanJob('ocr', ExtractionType.OCR, ocrRecognize),
        llmVision: makeScanJob('llm-vision', ExtractionType.LLM, visionRecognize(LLM_VISION_PROMPT, LLM_VISION_USER)),
        llmVisionTc: makeScanJob('llm-vision-tc', ExtractionType.LLM, visionRecognize(TC_VISION_PROMPT, TC_VISION_USER)),
    };
}
