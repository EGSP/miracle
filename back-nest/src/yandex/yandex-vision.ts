/**
 * Мультимодальная (vision) LLM через Yandex Responses API (порт back/src/lib/yandex/yandex-vision-llm.ts).
 *
 * Почему OpenAI SDK, а не @yandex-cloud/nodejs-sdk: vision доступен только через Responses API
 * (`ai.api.cloud.yandex.net/v1`), gRPC-контракт SDK поддерживает только текст. Responses API
 * совместим с OpenAI SDK при кастомном baseURL. Клиент сюда передаётся снаружи (из YandexService).
 */
import type OpenAI from 'openai';
import type {
    EasyInputMessage,
    Response,
    ResponseInputImage,
    ResponseInputText,
    ResponseOutputItem,
} from 'openai/resources/responses/responses.js';
import type { LlmPollResult } from './yandex-llm.types.js';

const VISION_MODEL_SUFFIX = 'qwen3.6-35b-a3b/latest';

export type VisionImageItem = Pick<ResponseInputImage, 'type' | 'image_url' | 'detail'>;
export type VisionTextItem = ResponseInputText;
export type VisionUserContent = VisionTextItem | VisionImageItem;

export type VisionMessage = Pick<EasyInputMessage, 'role'> & {
    role: 'user';
    content: VisionUserContent[];
};

export type VisionRequest = {
    /** Передаётся первым input_text в контенте сообщения. */
    instructions?: string;
    messages: VisionMessage[];
    /** 0.0–1.0. По умолчанию 0.1. */
    temperature?: number;
    maxOutputTokens?: number;
};

function formatVisionTaskFailure(response: Response, taskId: string): string {
    const status = response.status ?? 'unknown';
    const parts: string[] = [`Yandex Vision: задача "${taskId}" завершилась со статусом "${status}"`];

    if (response.error) {
        const err = response.error as unknown as Record<string, unknown>;
        const code = err['code'] ? `[${String(err['code'])}] ` : '';
        const message = typeof err['message'] === 'string' ? err['message'] : '';
        parts.push(`${code}${message}`);

        const { code: _code, message: _message, ...rest } = err;
        if (Object.keys(rest).length > 0) {
            parts.push(`details: ${JSON.stringify(rest)}`);
        }
    }

    if (response.incomplete_details?.reason) {
        parts.push(`Причина незавершения: ${response.incomplete_details.reason}`);
    }

    for (const hint of collectVisionOutputHints(response.output)) {
        parts.push(hint);
    }

    parts.push(`fullBody: ${JSON.stringify(response)}`);
    return parts.join(' — ');
}

function collectVisionOutputHints(output: ResponseOutputItem[] | undefined): string[] {
    const hints: string[] = [];
    for (const item of output ?? []) {
        if (item.type === 'message') {
            for (const part of item.content) {
                if (part.type === 'refusal') {
                    const refusal = part.refusal.trim();
                    if (refusal) {
                        hints.push(`Отказ модели: ${refusal}`);
                    }
                }
            }
        }
        const withError = item as ResponseOutputItem & { error?: string | null };
        if (typeof withError.error === 'string' && withError.error.trim()) {
            hints.push(`Ошибка элемента (${item.type}): ${withError.error.trim()}`);
        }
    }
    return hints;
}

function buildInput(request: VisionRequest): EasyInputMessage[] {
    return request.messages.map((msg) => ({
        role: msg.role,
        content: [
            ...(request.instructions ? [{ type: 'input_text' as const, text: request.instructions }] : []),
            ...msg.content,
        ],
    }));
}

function extractOutputText(output: ResponseOutputItem[]): string {
    const texts: string[] = [];
    for (const item of output ?? []) {
        if (item.type === 'message') {
            for (const content of item.content) {
                if (content.type === 'output_text') {
                    texts.push(content.text);
                }
            }
        }
    }
    return texts.join('');
}

/** Запускает фоновую vision-задачу и возвращает её ID. */
export async function submitVisionCompletion(
    client: OpenAI,
    folderId: string,
    request: VisionRequest,
): Promise<string> {
    const response = await client.responses.create({
        model: `gpt://${folderId}/${VISION_MODEL_SUFFIX}`,
        temperature: request.temperature ?? 0.1,
        max_output_tokens: request.maxOutputTokens ?? 40000,
        input: buildInput(request),
        background: true,
    });

    if (!response.id) {
        throw new Error('Yandex Vision: фоновый запрос не вернул ID задачи');
    }
    return response.id;
}

/** Однократно проверяет статус vision-задачи без блокирующего ожидания. */
export async function pollVisionCompletion(client: OpenAI, taskId: string): Promise<LlmPollResult<string>> {
    const response = await client.responses.retrieve(taskId);

    if (response.status === 'queued' || response.status === 'in_progress') {
        return { done: false };
    }

    if (response.status === 'failed' || response.status === 'cancelled' || response.status === 'incomplete') {
        throw new Error(formatVisionTaskFailure(response, taskId));
    }

    // output_text SDK заполняет только при object === 'response'; у Yandex при retrieve бывает иначе — fallback.
    const text = response.output_text || extractOutputText(response.output);
    if (!text) {
        const diag = JSON.stringify({
            status: response.status,
            outputCount: response.output?.length ?? 0,
            object: (response as unknown as Record<string, unknown>)['object'],
        });
        throw new Error(`Yandex Vision: ответ не содержит текста ${diag}`);
    }
    return { done: true, result: text.trim() };
}
