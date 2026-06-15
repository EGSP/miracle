import { Data, Effect } from 'effect';
import type {
    EasyInputMessage,
    Response,
    ResponseCreateParamsNonStreaming,
    ResponseInputContent,
    ResponseInputImage,
    ResponseInputText,
} from 'openai/resources/responses/responses.js';
import { formatUnknown } from '../common/effect-errors.js';
import { countTokens } from '../common/count-tokens.js';
import type { AppConfigService } from '../config/app-config.service.js';

export const YANDEX_MODELS = {
    text: 'yandexgpt-5.1/latest',
    vision: 'qwen3.6-35b-a3b/latest',
} as const;

export type YandexConfig = { apiKey: string; folderId: string };

export type YandexJsonSchemaFormat = {
    readonly name: string;
    readonly schema: Record<string, unknown>;
    readonly description?: string;
    readonly strict?: boolean;
};

/**
 * Провайдеро-нейтральный запрос. Потребитель НЕ выбирает транспорт: {@link YandexService}
 * сам определяет его по структуре `input` (есть картинки → vision/Responses API, иначе → SDK).
 */
export type YandexCreateResponseRequest = {
    readonly model?: string;
    readonly instructions?: string;
    readonly input: ResponseCreateParamsNonStreaming['input'];
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
    readonly jsonSchema?: YandexJsonSchemaFormat;
    readonly metadata?: ResponseCreateParamsNonStreaming['metadata'];
    /**
     * Явные теги атрибуции для ledger расхода токенов. Сливаются ПОВЕРХ ambient-тегов (см.
     * `withTokensUsageScope`), позволяя вызывающему переопределить/дополнить атрибуцию точечно.
     * Обычно не нужны — orderId/userId/jobRunId доезжают сами через ambient-контекст.
     */
    readonly tags?: Record<string, string>;
};

export type YandexCompletedResponse = {
    readonly done: true;
    readonly response: Response;
    readonly outputText: string;
};

export type YandexResponsePollResult =
    | { readonly done: false; readonly response: Response }
    | YandexCompletedResponse;

export class YandexConfigError extends Data.TaggedError('YandexConfigError')<{
    readonly message: string;
}> {}

export class YandexTransportError extends Data.TaggedError('YandexTransportError')<{
    readonly operation: 'create' | 'retrieve';
    readonly cause: unknown;
}> {
    override get message(): string {
        return `Yandex Responses ${this.operation}: ${formatUnknown(this.cause)}`;
    }
}

export class YandexResponseError extends Data.TaggedError('YandexResponseError')<{
    readonly responseId: string;
    readonly message: string;
    readonly response?: Response;
}> {}

export type YandexError = YandexConfigError | YandexTransportError | YandexResponseError;

export const YandexInput = {
    text: (text: string): ResponseInputText => ({ type: 'input_text', text }),
    imageDataUrl: (
        imageUrl: string,
        detail: ResponseInputImage['detail'] = 'auto',
    ): ResponseInputImage => ({
        type: 'input_image',
        image_url: imageUrl,
        detail,
    }),
    user: (content: ReadonlyArray<ResponseInputContent>): EasyInputMessage => ({
        role: 'user',
        content: [...content],
    }),
} as const;

/** Удаляет markdown-обёртку ```json ... ``` если модель добавила её вопреки инструкциям. */
export const stripMarkdownFences = (raw: string): string =>
    raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, '').trim();

/**
 * Признак vision-запроса: в `input` есть хотя бы один `input_image`. Это единственный фактор
 * выбора транспорта — картинки умеет только Responses API (Yandex SDK TextGeneration их не принимает).
 */
export const hasImageInput = (input: ResponseCreateParamsNonStreaming['input']): boolean => {
    if (input == null || typeof input === 'string') return false;
    for (const item of input) {
        const content = (item as { content?: unknown }).content;
        if (Array.isArray(content)) {
            for (const part of content) {
                if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'input_image') {
                    return true;
                }
            }
        }
    }
    return false;
};

/**
 * Эвристическая оценка отправленных токенов запроса (символы÷4) по `instructions` и текстовым частям
 * `input`. Картинки не учитываются. Нужна для фазы submit ledger, пока фактический usage неизвестен;
 * `null`, если текста нет.
 */
export const estimateInputTokens = (request: YandexCreateResponseRequest): number | null => {
    const parts: string[] = [];
    if (request.instructions) parts.push(request.instructions);

    const { input } = request;
    if (typeof input === 'string') {
        parts.push(input);
    } else if (input) {
        for (const item of input) {
            const content = (item as { content?: unknown }).content;
            if (typeof content === 'string') {
                parts.push(content);
            } else if (Array.isArray(content)) {
                for (const part of content) {
                    if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'input_text') {
                        parts.push(String((part as { text?: unknown }).text ?? ''));
                    }
                }
            }
        }
    }

    const text = parts.join('\n');
    return text ? countTokens(text) : null;
};

/** Приводит модель к `gpt://<folderId>/<model>`-форме, если она задана коротким именем. */
export const buildModelUri = (folderId: string, model: string | undefined): string => {
    const selected = model ?? YANDEX_MODELS.text;
    return selected.startsWith('gpt://') ? selected : `gpt://${folderId}/${selected}`;
};

/** Транспорт, которым был создан запрос. Едет внутри id, чтобы `poll` после рестарта роутил верно. */
export type TransportTag = 'sdk' | 'openai';

const ID_SEPARATOR = ':';

/** Помечает сырой id провайдера тегом транспорта: `sdk:<opId>` / `openai:<respId>`. */
export const tagResponseId = (tag: TransportTag, rawId: string): string => `${tag}${ID_SEPARATOR}${rawId}`;

/**
 * Разбирает помеченный id обратно в `{ tag, rawId }`. Id без известного префикса трактуется как
 * `openai` с сырым id целиком — это совместимость с уже летящими (до миграции) запросами.
 */
export const parseResponseId = (id: string): { tag: TransportTag; rawId: string } => {
    const idx = id.indexOf(ID_SEPARATOR);
    if (idx > 0) {
        const tag = id.slice(0, idx);
        if (tag === 'sdk' || tag === 'openai') {
            return { tag, rawId: id.slice(idx + ID_SEPARATOR.length) };
        }
    }
    return { tag: 'openai', rawId: id };
};

/** Единый transport-независимый контракт отправки/опроса. Реализуется обоими транспортами. */
export interface YandexTransport {
    readonly tag: TransportTag;
    /** Отправляет запрос и возвращает СЫРОЙ id провайдера (без тега транспорта). */
    submit(request: YandexCreateResponseRequest): Effect.Effect<string, YandexError>;
    /** Однократно читает состояние по сырому id провайдера. */
    retrieve(rawId: string): Effect.Effect<YandexResponsePollResult, YandexError>;
}

/** Читает и валидирует конфигурацию Yandex Cloud из окружения. */
export const readYandexConfig = (appConfig: AppConfigService): Effect.Effect<YandexConfig, YandexConfigError> => {
    const apiKey = appConfig.yandexApiKey;
    const folderId = appConfig.yandexFolderId;
    if (!apiKey || !folderId) {
        return Effect.fail(
            new YandexConfigError({
                message: 'Yandex Cloud не сконфигурирован: задайте YANDEX_CLOUD_API_KEY и YANDEX_CLOUD_FOLDER_ID',
            }),
        );
    }
    return Effect.succeed({ apiKey, folderId });
};
