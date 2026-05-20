import OpenAI from 'openai';
import type {
    EasyInputMessage,
    ResponseInputImage,
    ResponseInputText,
    ResponseOutputItem,
} from 'openai/resources/responses/responses.js';
import { yandex } from './yandex.js';
import type { LlmPollResult } from './yandex-llm.types.js';

/**
 * Почему здесь OpenAI SDK, а не @yandex-cloud/nodejs-sdk:
 *
 * Мультимодальный API доступен только через Yandex Responses API
 * (`ai.api.cloud.yandex.net/v1`). Тип `Message` в gRPC-контракте SDK
 * содержит только `text: string` — изображения не поддерживаются через gRPC
 * (проверено по `@yandex-cloud/nodejs-sdk@3.1.0`, `text_common.d.ts`).
 * Yandex Responses API совместим с OpenAI SDK при кастомном baseURL.
 */

// Модель с поддержкой vision из официального примера Yandex AI Studio
const VISION_MODEL_SUFFIX = 'qwen3.6-35b-a3b';

function createClient(apiKey: string, folderId: string): OpenAI {
    return new OpenAI({
        apiKey,
        baseURL: 'https://ai.api.cloud.yandex.net/v1',
        project: folderId,
    });
}

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

function buildInput(request: VisionRequest): EasyInputMessage[] {
    return request.messages.map((msg) => ({
        role: msg.role,
        content: [
            ...(request.instructions
                ? [{ type: 'input_text' as const, text: request.instructions }]
                : []),
            ...msg.content,
        ],
    }));
}

/**
 * Запускает фоновую задачу мультимодальной модели и сразу возвращает её ID.
 * Результат получается через `pollVisionCompletion`.
 */
export async function submitVisionCompletion(request: VisionRequest): Promise<string> {
    const { apiKey, folderId } = yandex.getConfig();
    const client = createClient(apiKey, folderId);

    const response = await client.responses.create({
        model: `gpt://${folderId}/${VISION_MODEL_SUFFIX}`,
        temperature: request.temperature ?? 0.1,
        max_output_tokens: request.maxOutputTokens ?? 10000,
        input: buildInput(request),
        background: true,
    });

    if (!response.id) {
        throw new Error('Yandex Vision: фоновый запрос не вернул ID задачи');
    }

    return response.id;
}

/**
 * Однократно проверяет статус фоновой задачи без блокирующего ожидания.
 * Вызывать в каждом тике воркера — позволяет проверять `shouldStop` между попытками.
 */
export async function pollVisionCompletion(taskId: string): Promise<LlmPollResult<string>> {
    const { apiKey, folderId } = yandex.getConfig();
    const client = createClient(apiKey, folderId);

    const response = await client.responses.retrieve(taskId);

    if (response.status === 'queued' || response.status === 'in_progress') {
        return { done: false };
    }

    if (response.status === 'failed' || response.status === 'cancelled') {
        throw new Error(`Yandex Vision: задача "${taskId}" завершилась со статусом "${response.status}"`);
    }

    // SDK вычисляет output_text только когда response.object === 'response'.
    // Yandex при retrieve() фоновой задачи может вернуть другое значение object —
    // тогда output_text не устанавливается. Извлекаем текст вручную как fallback.
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
