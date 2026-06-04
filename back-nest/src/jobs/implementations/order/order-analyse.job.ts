import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { z } from 'zod';
import {
    ExtractionStatus,
    type ApplicationData,
    type OrderPosition,
    type ProductType,
    type Stored,
} from '@miracle/types';
import { brandJobId, defineJob, type Job, type JobEnv } from '../../framework/job.js';
import { JobImpl } from '../../framework/job-impl.decorator.js';
import { Jobs } from '../../framework/context.js';
import { submitOnce, pollUntilDone } from '../../../common/cloud-job.js';
import { countTokens } from '../../../common/count-tokens.js';
import { resolveProductType, type LlmProductType } from '../../../orders/resolve-product-type.js';
import { OrderApplicationsService } from '../../../orders/order-applications.service.js';
import { OrderPositionsService } from '../../../orders/order-positions.service.js';
import { FilesContentService } from '../../../files-content/files-content.service.js';
import { ProductTypesService } from '../../../product-types/product-types.service.js';
import { YandexService } from '../../../yandex/yandex.service.js';

const FlatPositionZodSchema = z.object({
    productType: z
        .object({
            id: z.string().nullable().describe('id типа продукции из справочника или null'),
            name: z.string().nullable().describe('name типа продукции из справочника или null'),
        })
        .nullable()
        .describe('Тип продукции из справочника; null если не определён'),
    requirements: z
        .array(
            z.object({
                parameterName: z.string().describe('Полное название параметра/требования из заявки'),
                requiredValue: z.string().describe('Конкретное значение, требуемое заказчиком'),
            }),
        )
        .nullable()
        .describe('Список требований; null если в заявке нет пар «параметр → значение»'),
});

type FlatPosition = z.infer<typeof FlatPositionZodSchema>;
const FlatPositionJsonSchema = z.toJSONSchema(FlatPositionZodSchema) as Record<string, unknown>;

const POSITION_PROMPT = `Ты — ассистент для анализа заказов на промышленную продукцию.
Тебе передаётся текст, извлечённый из документа (OCR или парсинг). Возможны артефакты: лишние пробелы, опечатки, неверно распознанные символы, смещённые столбцы таблиц.
Извлеки из текста структурированные данные строго по переданной JSON-схеме.
Если таблица превращена в обычный текст, соседние строки часто образуют пару "название параметра" → "требуемое значение". Восстанавливай такие пары по смыслу и близости строк.

Отметки выбора (чекбоксы, галочки, крестики): по ним суди, что заказчик реально выбрал. В requirements включай только выбранное/подтверждённое. Невыбранные пункты не добавляй.

Для каждого элемента requirements:
- parameterName — полное название характеристики из заявки, с единицами измерения и обозначением.
- requiredValue — конкретное значение (в т.ч. выбранный вариант или краткое «требуется»).
- Не меняй местами название и значение; не сокращай название; не включай заголовки/служебный текст.
Поля productType, requirements всегда присутствуют: если данных нет — null.
Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.`;

function buildPositionUserMessage(applicationText: string): string {
    return [
        '=== ТИП ПРОДУКЦИИ ===',
        '',
        'Определение типа продукции для этого запроса отключено.',
        'В JSON-ответе укажи productType: null (id и name не заполняй).',
        '',
        '=== ТЕКСТ ЗАЯВКИ ===',
        '',
        applicationText,
    ].join('\n');
}

/** Преобразует плоский ответ LLM в черновик позиции; `null`, если нечего сохранять. */
function flatToPosition(
    flat: FlatPosition,
    applicationId: string,
    catalog: Stored<ProductType>[],
    findByNameOrSynonym: (name: string) => Stored<ProductType> | undefined,
): OrderPosition | null {
    const resolvedType = resolveProductType(flat.productType as LlmProductType, catalog, findByNameOrSynonym);
    const reqList = flat.requirements ?? [];
    const requirementsText =
        reqList.length > 0 ? reqList.map((req) => `${req.parameterName}: ${req.requiredValue}`).join('\n') : null;

    if (resolvedType === undefined && requirementsText === null) {
        return null;
    }

    return {
        applicationId,
        name: resolvedType?.productTypeName ?? 'Позиция',
        ...(resolvedType
            ? { productTypeId: resolvedType.productTypeId, productTypeName: resolvedType.productTypeName }
            : {}),
        data: {
            requirements: requirementsText,
            unit: null,
            quantity: null,
            alternatives: [],
            confidence: 'low',
            confidenceNote: 'Импортировано пайплайном order-analyse (без сегментации и оценки уверенности)',
        },
    };
}

type ApplicationsDep = Pick<OrderApplicationsService, 'get'>;
type FilesContentDep = Pick<FilesContentService, 'getContent'>;

/** Текст приложения: для текстового — напрямую, для файлового — из завершённого извлечения. */
const getApplicationText = (
    applications: ApplicationsDep,
    filesContent: FilesContentDep,
    applicationId: string,
): Effect.Effect<string, Error> =>
    Effect.gen(function* () {
        const app = yield* Effect.promise(() => applications.get(applicationId));
        if (!app) return yield* Effect.fail(new Error(`Приложение "${applicationId}" не найдено`));

        const data = app.data as ApplicationData;
        if (data.type === 'text') {
            const text = data.text.trim();
            if (!text) return yield* Effect.fail(new Error(`Приложение "${applicationId}" не содержит текста`));
            return text;
        }

        const allContent = yield* Effect.promise(() => filesContent.getContent(data.fileId));
        const completed = allContent.find((c) => c.meta?.extractionStatus === ExtractionStatus.COMPLETED);
        if (!completed) {
            return yield* Effect.fail(new Error(`Файл "${data.fileId}" не имеет завершённого извлечения`));
        }
        const text = (completed.content ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n\n');
        if (!text) return yield* Effect.fail(new Error(`Файл "${data.fileId}" не содержит текста`));
        return text;
    });

type PositionAnalyseInput = { applicationId: string };

/**
 * Корневой джоб `order-analyse`: заявка приложения → позиция заказа.
 * Дети: `llm` (opId под `memo`; output — черновик `OrderPosition`) → `apply` (создаёт позицию).
 */
@Injectable()
@JobImpl()
export class OrderAnalyseJob implements Job<PositionAnalyseInput, void> {
    readonly id = brandJobId('order-analyse');
    run!: Job<PositionAnalyseInput, void>['run'];

    constructor(
        applications: OrderApplicationsService,
        positions: OrderPositionsService,
        filesContent: FilesContentService,
        productTypes: ProductTypesService,
        yandex: YandexService,
    ) {
        const llm = defineJob(
            'order-analyse:llm',
            (input: PositionAnalyseInput): Effect.Effect<OrderPosition, unknown, JobEnv> =>
                Effect.gen(function* () {
                    const text = yield* getApplicationText(applications, filesContent, input.applicationId);
                    const userText = buildPositionUserMessage(text);
                    const opId = yield* submitOnce(
                        () =>
                            yandex.submitCompletion({
                                messages: [
                                    { role: 'system', text: POSITION_PROMPT },
                                    { role: 'user', text: userText },
                                ],
                                temperature: 0.1,
                                maxTokens: countTokens(POSITION_PROMPT + userText) * 10,
                                jsonSchema: FlatPositionJsonSchema,
                            }),
                        { finalPrompt: { system: POSITION_PROMPT, user: userText } },
                    );
                    const flat = yield* pollUntilDone<FlatPosition>(() =>
                        yandex.pollCompletionJson(opId, FlatPositionZodSchema),
                    );
                    const catalog = yield* Effect.promise(() => productTypes.getAll());
                    const normName = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
                    const position = flatToPosition(flat, input.applicationId, catalog, (name) => {
                        const norm = normName(name);
                        return catalog.find(
                            (item) =>
                                normName(item.name) === norm ||
                                (item.synonyms as string[]).some((s) => normName(s) === norm),
                        );
                    });
                    if (!position) {
                        return yield* Effect.fail(new Error(`Не удалось извлечь данные из заявки: ${JSON.stringify(flat)}`));
                    }
                    return position;
                }),
        );

        const apply = defineJob('order-analyse:apply', (position: OrderPosition) =>
            Effect.promise(() => positions.create(position)).pipe(Effect.asVoid),
        );

        this.run = (input: PositionAnalyseInput) =>
            Effect.gen(function* () {
                const jobs = yield* Jobs;
                const position = yield* jobs.run(llm, [jobs.runId, 'llm'], input);
                yield* jobs.run(apply, [jobs.runId, 'apply'], position);
            });
    }
}
