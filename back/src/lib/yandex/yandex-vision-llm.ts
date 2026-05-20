import OpenAI from 'openai';
import type { EasyInputMessage, ResponseInputImage, ResponseInputText } from 'openai/resources/responses/responses.js';
import { yandex } from './yandex.js';

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

/**
 * Синхронный вызов мультимодальной модели через Yandex Responses API (OpenAI SDK).
 * Возвращает текст ответа напрямую.
 */
export async function callVisionCompletion(request: VisionRequest): Promise<string> {
    const { apiKey, folderId } = yandex.getConfig();
    const client = createClient(apiKey, folderId);

    const input: EasyInputMessage[] = request.messages.map((msg) => ({
        role: msg.role,
        content: [
            ...(request.instructions
                ? [{ type: 'input_text' as const, text: request.instructions }]
                : []),
            ...msg.content,
        ],
    }));

    const response = await client.responses.create({
        model: `gpt://${folderId}/${VISION_MODEL_SUFFIX}`,
        temperature: request.temperature ?? 0.1,
        max_output_tokens: request.maxOutputTokens ?? 10000,
        input,
    });

    if (response.status !== 'completed') {
        throw new Error(JSON.stringify({ status: response.status, response }));
    }

    if (!response.output_text) {
        throw new Error('Yandex Vision: ответ не содержит текста');
    }

    return response.output_text.trim();
}
