import { randomUUID } from 'crypto';
import { Effect } from 'effect';
import { z } from 'zod';
import { ExtractionStatus, type TechnicalConditionRule } from '@miracle/types';
import type { Memo } from '../jobs/context.js';
import { andThen, named } from '../jobs/combinators.js';
import { leaf, type AnyJob } from '../jobs/job.js';
import { submitOnce, pollUntilDone } from '../common/cloud-job.js';
import { countTokens } from '../common/count-tokens.js';
import type { TechnicalConditionsService } from './technical-conditions.service.js';
import type { FilesContentService } from '../files-content/files-content.service.js';
import type { YandexService } from '../yandex/yandex.service.js';

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

export type TcJobsDeps = {
    tc: Pick<TechnicalConditionsService, 'getById' | 'replace'>;
    filesContent: Pick<FilesContentService, 'getContent'>;
    yandex: Pick<YandexService, 'submitCompletion' | 'pollCompletionJson'>;
};

type TcExtractInput = { tcId: string };
type TcExtractMid = { tcId: string; sections: TCDetailsResult['sections'] };

/** Строит составной джоб `tc-extract` (LLM-разбор ТУ → запись правил), замыкая зависимости. */
export function createTcJobs(deps: TcJobsDeps): { tcExtract: AnyJob } {
    const getTcText = (tcId: string): Effect.Effect<string, Error> =>
        Effect.gen(function* () {
            const tc = yield* Effect.promise(() => deps.tc.getById(tcId));
            if (!tc) return yield* Effect.fail(new Error(`TC "${tcId}" не найдено`));
            if (!tc.fileId) return yield* Effect.fail(new Error(`У TC "${tcId}" не прикреплён PDF-файл`));

            const allContent = yield* Effect.promise(() => deps.filesContent.getContent(tc.fileId!));
            const completed = allContent
                .find((c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED);
            if (!completed) {
                return yield* Effect.fail(
                    new Error(`Файл "${tc.fileId}" не имеет завершённого извлечения содержимого`),
                );
            }
            const text = (completed.content ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n\n');
            if (!text) return yield* Effect.fail(new Error(`Файл "${tc.fileId}" не содержит текста`));
            return text;
        });

    const tcDetailsLlm = leaf(
        'tc-details-llm',
        (input: TcExtractInput): Effect.Effect<TcExtractMid, unknown, Memo> =>
            Effect.gen(function* () {
                const text = yield* getTcText(input.tcId);
                const opId = yield* submitOnce(
                    () =>
                        deps.yandex.submitCompletion({
                            messages: [
                                { role: 'system', text: SYSTEM_PROMPT },
                                { role: 'user', text },
                            ],
                            temperature: 0.1,
                            maxTokens: countTokens(`${SYSTEM_PROMPT}\n\n${text}`) * 10,
                            jsonSchema: TCDetailsJsonSchema,
                        }),
                    { finalPrompt: { system: SYSTEM_PROMPT, user: text } },
                );
                const result = yield* pollUntilDone<TCDetailsResult>(() =>
                    deps.yandex.pollCompletionJson(opId, TCDetailsZodSchema),
                );
                return { tcId: input.tcId, sections: result.sections };
            }),
    );

    const tcApply = leaf('tc-details-apply', (input: TcExtractMid) =>
        Effect.gen(function* () {
            const sorted = [...input.sections].sort((a, b) => a.index - b.index);
            const rules: TechnicalConditionRule[] = sorted.map((r) => ({
                id: randomUUID(),
                // Yandex JSON Schema не поддерживает optional — пустую строку нормализуем в undefined.
                title: r.title || undefined,
                content: r.content,
            }));

            const tc = yield* Effect.promise(() => deps.tc.getById(input.tcId));
            if (!tc) return yield* Effect.fail(new Error(`TC "${input.tcId}" не найдено`));

            yield* Effect.promise(() =>
                deps.tc.replace(input.tcId, {
                    name: tc.name,
                    fileId: tc.fileId,
                    productTypeId: tc.productTypeId,
                    lastProductTypeName: tc.lastProductTypeName,
                    rules,
                    designationSlots: tc.designationSlots ?? [],
                    displayTemplates: tc.displayTemplates ?? [],
                }),
            );
        }),
    );

    return { tcExtract: tcDetailsLlm.pipe(andThen(tcApply), named('tc-extract')) };
}
