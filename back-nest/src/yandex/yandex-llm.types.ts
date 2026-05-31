export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmMessage = {
    role: LlmRole;
    text: string;
};

export type LlmRequest = {
    messages: LlmMessage[];
    /** 0.0–1.0. Для структурированного вывода рекомендуется 0.1. По умолч. 0.3. */
    temperature?: number;
    maxTokens?: number;
    /** JSON Schema объект — передаётся нативным параметром `jsonSchema` в Yandex API. */
    jsonSchema?: Record<string, unknown>;
};

export type LlmPollResult<T = string> = { done: false } | { done: true; result: T };
