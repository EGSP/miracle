import { Injectable } from '@nestjs/common';
import { Effect, Option } from 'effect';
import { z } from 'zod';
import type { OrderPosition, OrderPositionData, ProductType, Stored } from '@miracle/types';
import { brandJobId, defineJob, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs, Memo } from '../../framework/context.js';
import { submitOnce, pollUntilDone } from '../../../common/cloud-job.js';
import { tryLabeledPromise, wrapUnknown } from '../../../common/effect-errors.js';
import { LLM_MAX_OUTPUT_TOKENS } from '../../../common/llm-limits.js';
import { resolveProductType } from '../../../orders/resolve-product-type.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { ProductTypesService } from '../../../product-types/product-types.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';

// ── Схема выхода LLM (массив обёрнут в объект; Yandex не допускает .optional — только .nullable) ──

const PositionZodSchema = z.object({
    productType: z
        .object({
            id: z.string().nullable().describe('id типа продукции из справочника или null'),
            name: z.string().nullable().describe('name типа продукции из справочника или null'),
        })
        .nullable()
        .describe('Тип продукции из справочника; null если не из нашей номенклатуры или тип не определён'),
    name: z.string().describe('Дословное название/обозначение позиции от заказчика'),
    requirements: z.string().nullable().describe('Дословный текст требований/шифра для этой позиции; null если нет'),
    unit: z.string().nullable().describe('Единица измерения verbatim ("шт", "м", "компл"); null'),
    quantity: z.string().nullable().describe('Количество verbatim ("10", "по 5", "5-10"); null'),
    alternatives: z
        .array(z.string())
        .describe('Взаимозаменяемые варианты — аналоги разных производителей одного изделия; [] если нет'),
    confidence: z.enum(['high', 'medium', 'low']).describe('Уверенность в ВЫДЕЛЕНИИ позиции (сегментация), не в типе'),
    confidence_note: z.string().nullable().describe('Чем вызвана неуверенность; null если уверен'),
});

const PositionsZodSchema = z.object({ positions: z.array(PositionZodSchema) });
type LlmPosition = z.infer<typeof PositionZodSchema>;
const PositionsJsonSchema = z.toJSONSchema(PositionsZodSchema) as Record<string, unknown>;

const SYSTEM_PROMPT_BASE = `Ты — ассистент для анализа заказов на промышленную продукцию.
Тебе передаётся кусок данных из приложения заказа (JSON: фрагмент таблицы или текста). Возможны артефакты: лишние пробелы, опечатки, смещённые столбцы.

Твоя задача — выделить из куска СПИСОК ПОЗИЦИЙ. Позиция = одна заказная единица продукции: один продукт с одним связным набором требований. Позиций может быть одна или много.

Правила сегментации:
- Извлекай ВСЕ позиции, в том числе продукцию, которой нет в справочнике ниже. Для неё productType: null. Ничего не отфильтровывай.
- Одна ячейка/строка может перечислять несколько РАЗНЫХ продуктов — раздели их на отдельные позиции.
- Одна ячейка может содержать несколько обозначений ОДНОГО И ТОГО ЖЕ изделия (аналоги разных производителей, любой подходит) — это ОДНА позиция: основное обозначение в name, остальные в alternatives. Дубли не плоди.
- Различитель: взаимозаменяемые варианты одного изделия (один тип, одно назначение) → одна позиция с alternatives; разные изделия → разные позиции.

Правила захвата:
- requirements/шифр захватывай ДОСЛОВНО, как в источнике. Не интерпретируй, не разворачивай условные обозначения, не разбивай на пары параметр→значение.
- unit и quantity — verbatim; если значения нет — null.
- confidence — уверенность в ВЫДЕЛЕНИИ позиции (что это действительно отдельная единица), НЕ в типе продукции. Если не уверен — confidence_note поясняет, чем.

Правила определения типа продукции (productType):
- Определи НАИБОЛЕЕ ПОДХОДЯЩИЙ тип из справочника ниже ПО СМЫСЛУ изделия, а не по буквальному совпадению строк.
- Имена и синонимы в справочнике — это ОРИЕНТИРЫ и примеры формулировок, а НЕ закрытый список допустимых названий. Реальное обозначение заказчика может звучать иначе, но относиться к тому же типу — сопоставляй по назначению и сути изделия.
- Если сомневаешься между близкими типами — выбирай наиболее вероятный. НЕ уходи в null только из-за того, что формулировка не совпала со справочником дословно.
- productType: null ставь ТОЛЬКО если по смыслу не подходит ни один тип (изделие вне нашей номенклатуры).
- В ОТВЕТЕ productType.id и productType.name копируй ДОСЛОВНО из выбранной строки справочника, без изменений.

Отвечай ТОЛЬКО валидным JSON по схеме, без markdown-обёртки.`;

function buildSystemPrompt(catalog: Stored<ProductType>[]): string {
    const lines = catalog.map((type) => {
        const synonyms = type.synonyms as string[];
        const synPart = synonyms.length > 0 ? ` (синонимы: ${synonyms.join(', ')})` : '';
        return `- ${type.name}${synPart} [id: ${type.id}]`;
    });
    const catalogBlock =
        lines.length > 0 ? lines.join('\n') : '(справочник типов пуст — для всех позиций productType: null)';
    const catalogHint =
        'Синонимы в скобках — примеры формулировок для распознавания по смыслу, а не исчерпывающий список названий.';
    return `${SYSTEM_PROMPT_BASE}\n\n=== СПРАВОЧНИК ТИПОВ ПРОДУКЦИИ ===\n${catalogHint}\n${catalogBlock}`;
}

const normName = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** Преобразует позицию из ответа LLM в доменную `OrderPosition` (с резолвом типа по каталогу). */
function toOrderPosition(
    llm: LlmPosition,
    applicationId: string,
    catalog: Stored<ProductType>[],
): OrderPosition {
    const resolved = resolveProductType(llm.productType, catalog, (name) => {
        const norm = normName(name);
        return catalog.find(
            (item) => normName(item.name) === norm || (item.synonyms as string[]).some((s) => normName(s) === norm),
        );
    });

    const data: OrderPositionData = {
        requirements: llm.requirements,
        unit: llm.unit,
        quantity: llm.quantity,
        alternatives: llm.alternatives,
        confidence: llm.confidence,
        confidenceNote: llm.confidence_note,
    };

    return {
        applicationId,
        name: llm.name,
        ...(resolved
            ? { productTypeId: resolved.productTypeId, productTypeName: resolved.productTypeName }
            : {}),
        data,
    };
}

/**
 * Вход джоба. `chunk` — кусок данных (JSON-сериализуемый фрагмент таблицы/текста), а не строка-объект
 * таблицы. `chunkKey` — необязательный строковый идентификатор куска: его использует ПРОДЬЮСЕР как
 * ключ идемпотентного запуска (`start(..., ['extract-positions', applicationId, chunkKey])`), чтобы
 * повторная отправка того же куска не плодила прогоны. Само тело джоба ключ детей строит от `runId`.
 */
type ExtractInput = { applicationId: string; chunk: unknown; chunkKey?: string };

/**
 * Корневой джоб `extract-positions-from-chunk`: кусок данных приложения → список позиций заказа.
 * Дети: `llm` (opId под `memo`; output — `OrderPosition[]`) → `apply` (перезапись позиций прогона).
 *
 * Шаг A пайплайна: только сегментация, классификация типа по справочнику и дословный захват.
 * Интерпретация требований/условного обозначения — на последующих шагах (analyse-designation / ТУ).
 */
@Injectable()
@JobImpl()
export class ExtractPositionsFromChunkJob implements Job<ExtractInput, void> {
    readonly id = brandJobId('extract-positions-from-chunk');
    run!: Job<ExtractInput, void>['run'];

    constructor(
        positions: OrderPositionsService,
        productTypes: ProductTypesService,
        yandex: YandexService,
    ) {
        const llm = defineJob(
            'extract-positions-from-chunk:llm',
            (input: ExtractInput): Effect.Effect<OrderPosition[], unknown, JobEnv> =>
                Effect.gen(function* () {
                    const chunkLabel = input.chunkKey ?? 'unknown';
                    const catalog = yield* tryLabeledPromise('загрузка каталога типов продукции', () => productTypes.getAll());
                    const system = buildSystemPrompt(catalog);
                    const userText = yield* Effect.try({
                        try: () => JSON.stringify(input.chunk),
                        catch: wrapUnknown(`serialize chunk "${chunkLabel}"`),
                    });

                    const opId = yield* submitOnce(
                        () =>
                            yandex.submitCompletion({
                                messages: [
                                    { role: 'system', text: system },
                                    { role: 'user', text: userText },
                                ],
                                temperature: 0.1,
                                maxTokens: LLM_MAX_OUTPUT_TOKENS,
                                jsonSchema: PositionsJsonSchema,
                            }),
                        {
                            label: `extract positions submit; chunk=${chunkLabel}`,
                            extraMemo: { finalPrompt: { system, user: userText } },
                        },
                    );
                    const out = yield* pollUntilDone(
                        () => yandex.pollCompletionJson(opId, PositionsZodSchema),
                        { label: `extract positions poll; opId=${opId}` },
                    );
                    // Диагностика: сохраняем сырой ответ модели (до резолва типа по каталогу) рядом
                    // с finalPrompt в memo — чтобы видеть, что именно вернул LLM в productType.
                    const memo = yield* Memo;
                    yield* memo.set('rawResponse', out);
                    return out.positions.map((p) => toOrderPosition(p, input.applicationId, catalog));
                }).pipe(
                    Effect.mapError(
                        (error) =>
                            new Error(
                                `Не удалось извлечь позиции из чанка "${input.chunkKey ?? 'unknown'}" приложения "${input.applicationId}"`,
                                { cause: error },
                            ),
                    ),
                ),
        );

        const apply = defineJob('extract-positions-from-chunk:apply', (created: OrderPosition[]) =>
            Effect.gen(function* () {
                const memo = yield* Memo;
                // Идемпотентность по прогону: при перезапуске удаляем то, что записал ЭТОТ прогон
                // (id в memo), и пишем заново. Не трогаем позиции других чанков того же приложения.
                const previous = yield* memo.get<string[]>('createdIds');
                if (Option.isSome(previous)) {
                    yield* tryLabeledPromise('удаление предыдущих позиций при применении extract-positions', () =>
                        positions.deleteMany(previous.value),
                    );
                }
                const ids: string[] = [];
                for (const position of created) {
                    const row = yield* tryLabeledPromise(`создание извлечённой позиции "${position.name}"`, () =>
                        positions.create(position),
                    );
                    ids.push(row.id);
                }
                yield* memo.set('createdIds', ids);
            }).pipe(
                Effect.mapError(
                    (error) => new Error('Не удалось записать извлечённые позиции приложения', { cause: error }),
                ),
            ),
        );

        this.run = (input: ExtractInput) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const created = yield* jobs.run(llm, [jobs.runId, 'llm'], input);
                yield* jobs.run(apply, [jobs.runId, 'apply'], created);
            });
    }
}
