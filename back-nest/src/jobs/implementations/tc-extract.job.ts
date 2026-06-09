import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { z } from 'zod';
import { ExtractionStatus, type SlotRule } from '@miracle/types';
import { brandJobId, defineJob, type Job, type JobEnv } from '../framework/job.js';
import { JobImpl } from '../framework/job-impl.decorator.js';
import { Jobs, Progress } from '../framework/context.js';
import { submitOnce, pollUntilDone } from '../../common/cloud-job.js';
import { countTokens } from '../../common/count-tokens.js';
import { tryLabeledPromise } from '../../common/effect-errors.js';
import { TechnicalConditionsService } from '../../technical-conditions/technical-conditions.service.js';
import { FilesContentService } from '../../files-content/files-content.service.js';
import { YandexService } from '../../yandex/yandex.service.js';

const TCDetailsZodSchema = z.object({
    sections: z
        .array(
            z.object({
                index: z.number().describe('Порядковый номер раздела в тексте (0-based)'),
                title: z
                    .string()
                    .describe(
                        'Краткое смысловое резюме раздела в 5–10 слов — сформулируй сам. '
                        + 'Не копируй первую строку дословно. Пустая строка только если темы нет.',
                    ),
                content: z
                    .string()
                    .describe(
                        'Полный текст раздела дословно. Таблицы — в markdown с разделителем и всеми строками. '
                        + 'Переносы строк — символ \\n.',
                    ),
            }),
        )
        .describe('Все разделы документа ТУ в порядке появления в тексте'),
});

type TCDetailsResult = z.infer<typeof TCDetailsZodSchema>;
const TCDetailsJsonSchema = z.toJSONSchema(TCDetailsZodSchema) as Record<string, unknown>;

const SYSTEM_PROMPT = `Ты разбиваешь текст Технического Условия (ТУ) на структурированные разделы для последующей работы с ними.

Идёшь по тексту сверху вниз и для каждой смысловой единицы создаёшь один элемент в массиве sections.

Что считается отдельным разделом:
- нумерованный пункт или подпункт
- ненумерованный абзац, представляющий самостоятельную мысль
- таблица (классификация, параметры, размеры, варианты исполнения и т.п.)
- примечание, сноска или ссылка на нормативный документ
- пример условного обозначения с расшифровкой

Как заполнять поля:
- index — порядковый номер по тексту, начиная с 0
- title — твоя формулировка темы раздела в 5–10 слов; не первая строка дословно. Пустая строка допустима.
- content — текст раздела дословно, без перефразирования; переносы строк — \\n.

Особое внимание таблицам:
- оформляй таблицу как markdown с шапкой и строкой-разделителем |---|
- переноси ВСЕ строки данных, ничего не сокращай и не пропускай
- если у таблицы есть подпись или номер ("Таблица 1 — …"), включай её в content перед таблицей
- если таблица разорвана разрывом страницы или повторяющейся шапкой — собирай её обратно в одну
- объединённые ячейки разворачивай, дублируя значение в каждую строку

Если сомневаешься, где граница между блоками, лучше создай два раздела, чем один объединённый.`;

type TcExtractInput = { tcId: string };
type TcExtractMid = { tcId: string; sections: TCDetailsResult['sections'] };

type TcDep = Pick<TechnicalConditionsService, 'getById' | 'replace'>;
type FilesContentDep = Pick<FilesContentService, 'getContent'>;

/** Текст ТУ из завершённого извлечения прикреплённого PDF. */
const getTcText = (tc: TcDep, filesContent: FilesContentDep, tcId: string): Effect.Effect<string, Error> =>
    Effect.gen(function* () {
        const condition = yield* tryLabeledPromise(`загрузка ТУ "${tcId}"`, () => tc.getById(tcId));
        if (!condition) return yield* Effect.fail(new Error(`TC "${tcId}" не найдено`));
        if (!condition.fileId) return yield* Effect.fail(new Error(`У TC "${tcId}" не прикреплён PDF-файл`));

        const allContent = yield* tryLabeledPromise(`загрузка извлечённого содержимого файла ТУ "${condition.fileId}"`, () =>
            filesContent.getContent(condition.fileId!),
        );
        const completed = allContent.find((c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED);
        if (!completed) {
            return yield* Effect.fail(new Error(`Файл "${condition.fileId}" не имеет завершённого извлечения содержимого`));
        }
        const text = (completed.content ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n\n');
        if (!text) return yield* Effect.fail(new Error(`Файл "${condition.fileId}" не содержит текста`));
        return text;
    });

/**
 * Корневой джоб `tc-extract`: LLM-разбор ТУ на разделы → запись правил.
 * Дети: `llm` (opId под `memo`; output — разделы) → `apply` (идемпотентный `tc.replace`).
 */
@Injectable()
@JobImpl()
export class TcExtractJob implements Job<TcExtractInput, void> {
    readonly id = brandJobId('tc-extract');
    run!: Job<TcExtractInput, void>['run'];

    constructor(tc: TechnicalConditionsService, filesContent: FilesContentService, yandex: YandexService) {
        const llm = defineJob(
            'tc-extract:llm',
            (input: TcExtractInput): Effect.Effect<TcExtractMid, unknown, JobEnv> =>
                Effect.gen(function* () {
                    const progress = yield* Progress;
                    yield* progress.push(0, { label: 'загрузка текста ТУ' });

                    const text = yield* getTcText(tc, filesContent, input.tcId);
                    yield* progress.push(0.1, { label: 'отправка запроса LLM', determined: false });

                    const opId = yield* submitOnce(
                        () =>
                            yandex.submitCompletion({
                                messages: [
                                    { role: 'system', text: SYSTEM_PROMPT },
                                    { role: 'user', text },
                                ],
                                temperature: 0.1,
                                maxTokens: countTokens(`${SYSTEM_PROMPT}\n\n${text}`) * 10,
                                jsonSchema: TCDetailsJsonSchema,
                            }),
                        {
                            label: `tc extract submit; tc=${input.tcId}`,
                            submitProgressLabel: 'отправка запроса LLM',
                            pollProgressLabel: 'ожидание ответа LLM',
                            extraMemo: { finalPrompt: { system: SYSTEM_PROMPT, user: text } },
                        },
                    );
                    const result = yield* pollUntilDone<TCDetailsResult>(
                        () => yandex.pollCompletionJson(opId, TCDetailsZodSchema),
                        { label: `tc extract poll; opId=${opId}` },
                    );
                    return { tcId: input.tcId, sections: result.sections };
                }).pipe(
                    Effect.mapError(
                        (error) =>
                            new Error(`Не удалось разобрать ТУ "${input.tcId}" на разделы`, { cause: error }),
                    ),
                ),
        );

        const apply = defineJob('tc-extract:apply', (input: TcExtractMid) =>
            Effect.gen(function* () {
                const progress = yield* Progress;
                yield* progress.push(0.9, { label: 'запись разделов ТУ' });

                const sorted = [...input.sections].sort((a, b) => a.index - b.index);
                const slotRules: SlotRule[] = sorted.map((r) => ({
                    index: r.index,
                    name: r.title.trim(),
                    text: r.content,
                }));

                const condition = yield* tryLabeledPromise(`загрузка ТУ "${input.tcId}" перед заменой`, () =>
                    tc.getById(input.tcId),
                );
                if (!condition) return yield* Effect.fail(new Error(`TC "${input.tcId}" не найдено`));

                yield* tryLabeledPromise(`замена правил слотов ТУ "${input.tcId}"`, () =>
                    tc.replace(input.tcId, {
                        name: condition.name,
                        fileId: condition.fileId,
                        productTypeId: condition.productTypeId,
                        lastProductTypeName: condition.lastProductTypeName,
                        slotRules,
                        designationDecodeExamples: condition.designationDecodeExamples,
                        displayTemplates: condition.displayTemplates ?? [],
                    }),
                );
            }).pipe(
                Effect.mapError(
                    (error) => new Error(`Не удалось записать разделы ТУ "${input.tcId}"`, { cause: error }),
                ),
            ),
        );

        this.run = (input: TcExtractInput) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const mid = yield* jobs.run(llm, [jobs.runId, 'llm'], input);
                yield* jobs.run(apply, [jobs.runId, 'apply'], mid);
            });
    }
}
