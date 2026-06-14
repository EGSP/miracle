import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { z } from 'zod';
import { CONFIDENCE_VALUES, estimateTokens, type Confidence } from '@miracle/types';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { wrapUnknown } from '../../../../common/effect-errors.js';
import { LLM_MAX_OUTPUT_TOKENS } from '../../../../common/llm-limits.js';
import { YANDEX_MODELS, YandexInput, YandexService } from '../../../../yandex/yandex.service.js';

/** Позиция группы в payload одного слота: локальный индекс + дословные название и требования. */
export type DesignationSlotPosition = {
    readonly localIndex: number;
    readonly name: string;
    readonly requirements: string[];
};

/**
 * Вход инструмента: правило ОДНОГО слота + примеры расшифровки + массив позиций группы.
 * `tcId`/`slotIndex` не идут в промпт — они лишь часть семантического ключа вызова (см. группа-джоб).
 */
export type DesignationSlotInput = {
    readonly tcId: string;
    readonly slotIndex: number;
    readonly slotName: string;
    readonly slotRuleText: string;
    readonly decodeExamples: string | null;
    /**
     * Название типа продукции группы (групповой, а не per-position: группа однотипна по ТУ).
     * Подаётся одной строкой в шапку запроса как явный контекст изделия; `null` — если у позиций
     * группы тип не проставлен. Дешевле per-position-дублирования и помогает модели не путать
     * параметр обозначения с похожими по форме значениями из других типов продукции.
     */
    readonly productTypeName: string | null;
    readonly positions: ReadonlyArray<DesignationSlotPosition>;
};

/** Ответ модели по одной позиции: значение слота, уверенность (enum) и обоснование. */
export type DesignationSlotValue = {
    readonly localIndex: number;
    readonly value: string | null;
    readonly confidence: Confidence;
    readonly reasoning: string;
};

/**
 * Расход токенов этого LLM-вызова. Сохраняется в памяти инструмента (его и вызвал Yandex), отдельной
 * записью на каждый вызов слота.
 *
 * Трио `inputTokens`/`outputTokens`/`totalTokens` — фактические значения из `usage` ответа Yandex;
 * `null`, если провайдер не вернул `usage`. `heuristicTokens` — наша эвристическая оценка (символы÷4)
 * по финальному промпту и ответу: фолбэк и сверка, когда фактического `usage` нет. Метрика
 * best-effort, на результат анализа не влияет.
 */
export type DesignationSlotUsage = {
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly totalTokens: number | null;
    readonly heuristicTokens: number;
};

type DesignationSlotMemo = {
    opId?: string;
    /** Финальный промпт вызова (system + user) — для диагностики, как в джобах v1. */
    finalPrompt?: { system: string; user: string };
    values?: DesignationSlotValue[];
    usage?: DesignationSlotUsage;
};

const DesignationSlotZodSchema = z.object({
    values: z
        .array(
            z.object({
                localIndex: z.number().describe('Локальный индекс позиции из переданного списка'),
                value: z
                    .string()
                    .nullable()
                    .describe('Значение слота строго из вариантов правила ТУ; null если не определимо'),
                confidence: z
                    .enum(CONFIDENCE_VALUES)
                    .describe('Уверенность: high — однозначно по требованиям/правилу; medium — вероятно; low — догадка'),
                reasoning: z.string().describe('1–2 фразы обоснования; для null — чего не хватило'),
            }),
        )
        .describe('По одному элементу на каждую переданную позицию'),
});

const DesignationSlotJsonSchema = z.toJSONSchema(DesignationSlotZodSchema) as Record<string, unknown>;

const SLOT_PROMPT = `Ты определяешь значение ОДНОГО параметра условного обозначения промышленной продукции для набора позиций заказа.

На вход поступает:
1. Тип продукции группы (все позиции — одного типа по одному ТУ).
2. Один параметр обозначения (слот): его название и правило выбора значения из Технического Условия (ТУ).
3. (Опционально) Примеры расшифровки похожих фрагментов из заявок.
4. Массив позиций: для каждой — локальный индекс, дословное название (часто содержит шифр/обозначение) и требования заказчика.

Для КАЖДОЙ позиции определи значение ТОЛЬКО этого слота:
- Подбери значение строго из допустимых вариантов правила ТУ. Не придумывай новые коды.
- Опирайся на название и требования позиции; сопоставляй по смыслу при иной формулировке.
- Если правило задаёт значение по умолчанию или единственный вариант — используй его.
- Если определить нельзя даже приблизительно — value: null с пояснением в reasoning.

Ответь по одному элементу на каждую позицию: localIndex, value (или null), confidence (high/medium/low), reasoning (1–2 фразы).
Верни ответ строго в JSON по схеме.`;

function buildUserMessage(input: DesignationSlotInput): string {
    const productTypeBlock = input.productTypeName
        ? ['=== ТИП ПРОДУКЦИИ ===', '', input.productTypeName].join('\n')
        : null;

    const slotBlock = [
        '=== ПАРАМЕТР ОБОЗНАЧЕНИЯ ===',
        '',
        `Слот №${input.slotIndex} — ${input.slotName}`,
        'Правило из ТУ:',
        '---',
        input.slotRuleText.trim() || '(текст правила не задан)',
        '---',
    ].join('\n');

    const examplesBlock = input.decodeExamples?.trim()
        ? ['=== ПРИМЕРЫ РАСШИФРОВКИ ИЗ ЗАЯВОК ===', '', input.decodeExamples.trim()].join('\n')
        : null;

    const positionsBlock = [
        '=== ПОЗИЦИИ ===',
        '',
        ...input.positions.map((position) => {
            const requirements =
                position.requirements.length > 0
                    ? position.requirements.map((line) => `  - ${line}`).join('\n')
                    : '  (требований нет)';
            return [`[${position.localIndex}] ${position.name}`, 'Требования:', requirements].join('\n');
        }),
    ].join('\n\n');

    return [productTypeBlock, slotBlock, examplesBlock, positionsBlock].filter(Boolean).join('\n\n');
}

/**
 * JobTool: один слот условного обозначения × массив позиций группы за один LLM-вызов.
 *
 * Это «рабочая лошадь» пошагового анализа v2. Инструмент не знает про группы и базу: группа-джоб
 * готовит payload (правило слота + примеры + позиции с локальными индексами) и пишет результат.
 * `opId` сохраняется в ToolMemo ДО ожидания (submit-once): при рестарте инструмент продолжает
 * polling существующей операции, а не отправляет запрос повторно; готовый разбор тоже кэшируется.
 */
@Injectable()
export class DesignationSlotTool
    implements JobTool<DesignationSlotInput, DesignationSlotValue[], DesignationSlotMemo>
{
    readonly type = brandJobToolType('order.designation.slot.llm.v1');

    constructor(private readonly yandex: YandexService) {}

    run = (input: DesignationSlotInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<DesignationSlotMemo>();

            const cached = yield* memo.get((m) => m.values);
            if (cached) {
                return cached;
            }

            const userMessage = buildUserMessage(input);

            let opId = yield* memo.get((m) => m.opId);
            if (!opId) {
                yield* memo.set((m) => m.finalPrompt, { system: SLOT_PROMPT, user: userMessage });
                opId = yield* this.yandex.createResponse({
                    model: YANDEX_MODELS.text,
                    instructions: SLOT_PROMPT,
                    input: [YandexInput.user([YandexInput.text(userMessage)])],
                    temperature: 0.1,
                    maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
                    jsonSchema: { name: 'AnalyseDesignationSlot', schema: DesignationSlotJsonSchema },
                });
                yield* memo.set((m) => m.opId, opId);
            }

            const completed = yield* this.yandex.poll(opId);

            const parsed = yield* Effect.try({
                try: () => DesignationSlotZodSchema.parse(JSON.parse(completed.outputText)),
                catch: wrapUnknown(`parse designation slot response; opId=${opId}`),
            });

            // Трио токенов сохраняет тот, кто вызвал Yandex, — сам инструмент, в свою память.
            // Трио — фактические из usage (best-effort, null если не вернулся); heuristic — наша оценка.
            const usage: DesignationSlotUsage = {
                inputTokens: completed.response.usage?.input_tokens ?? null,
                outputTokens: completed.response.usage?.output_tokens ?? null,
                totalTokens: completed.response.usage?.total_tokens ?? null,
                heuristicTokens: estimateTokens(SLOT_PROMPT + userMessage + completed.outputText),
            };

            yield* memo.set((m) => m.values, parsed.values);
            yield* memo.set((m) => m.usage, usage);
            return parsed.values;
        });
}
