# AI — генерация текста (YandexGPT)

## Кейс: получить текст → получить JSON-ответ от ИИ

Это наиболее частый сценарий: передать текст модели, получить структурированный JSON. Все примеры ниже решают именно эту задачу с нарастающей сложностью.

---

## Уровень 1 — Минимальный запрос (sync)

Самый простой вариант: отправить текст, получить строку.

```typescript
import { Session } from '@yandex-cloud/nodejs-sdk';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';

const session = new Session({
    iamToken: '',
    headers: { Authorization: `Api-Key ${process.env.YANDEX_CLOUD_API_KEY}` },
});

const client = session.client(
    textGenerationService.TextGenerationServiceClient
);

const stream = client.completion(
    textGenerationService.CompletionRequest.fromPartial({
        modelUri: `gpt://${process.env.YANDEX_CLOUD_FOLDER_ID}/yandexgpt/latest`,
        completionOptions: {
            stream: false,    // false = дождаться полного ответа
            temperature: 0.3,
            maxTokens: 1000,
        },
        messages: [
            { role: 'user', text: 'Привет! Кто ты?' },
        ],
    })
);

// stream — async iterable, последний чанк содержит полный ответ
let finalText = '';
for await (const chunk of stream) {
    finalText = chunk.alternatives[0]?.message?.text ?? '';
}

console.log(finalText);
```

---

## Уровень 2 — JSON-ответ через system prompt

Чтобы модель вернула JSON, используйте `system`-роль с явными инструкциями. При `stream: false` — каждый чанк содержит накопленный текст, последний чанк = полный ответ.

```typescript
async function extractJson<T>(inputText: string): Promise<T> {
    const client = session.client(
        textGenerationService.TextGenerationServiceClient
    );

    const stream = client.completion(
        textGenerationService.CompletionRequest.fromPartial({
            modelUri: `gpt://${process.env.YANDEX_CLOUD_FOLDER_ID}/yandexgpt/latest`,
            completionOptions: {
                stream: false,
                temperature: 0.1,  // ниже temperature = более детерминированный ответ
                maxTokens: 2000,
            },
            messages: [
                {
                    role: 'system',
                    text: [
                        'Ты — ассистент для извлечения данных.',
                        'Отвечай ТОЛЬКО валидным JSON без markdown-блоков и пояснений.',
                        'Не добавляй ```json и ``` вокруг ответа.',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    text: inputText,
                },
            ],
        })
    );

    let rawText = '';
    for await (const chunk of stream) {
        rawText = chunk.alternatives[0]?.message?.text ?? '';
    }

    return JSON.parse(rawText) as T;
}

// Использование
interface InvoiceData {
    number: string;
    date: string;
    amount: number;
    currency: string;
}

const result = await extractJson<InvoiceData>(
    'Извлеки данные счёта: Счёт №А-1234 от 15.03.2024 на сумму 45 000 руб.'
);
// { number: 'А-1234', date: '15.03.2024', amount: 45000, currency: 'руб' }
```

---

## Уровень 3 — JSON-ответ через нативный параметр `jsonSchema` (рекомендуется)

Yandex Cloud поддерживает передачу JSON Schema как отдельного поля запроса — `jsonSchema`. Это надёжнее, чем вставлять схему в текст промпта: модель получает структуру напрямую через API, а не пытается разобрать её из текста.

### Как это устроено в proto

В `CompletionRequest` есть `oneof ResponseFormat` с двумя вариантами:

```proto
oneof ResponseFormat {
    bool json_object = 5;      // просто "верни валидный JSON-объект"
    JsonSchema json_schema = 6; // верни JSON, соответствующий конкретной схеме
}

message JsonSchema {
    google.protobuf.Struct schema = 1; // JSON Schema как произвольный объект
}
```

> Эти варианты **взаимно исключают** друг друга — передаётся только один.

### Использование `jsonSchema`

```typescript
interface AnalysisResult {
    sentiment: 'positive' | 'negative' | 'neutral';
    topics: string[];
    summary: string;
    confidence: number;
}

async function analyzeText(text: string): Promise<AnalysisResult> {
    const stream = client.completion(
        textGenerationService.CompletionRequest.fromPartial({
            modelUri: `gpt://${folderId}/yandexgpt/latest`,
            completionOptions: { stream: false, temperature: 0.1, maxTokens: 1000 },
            messages: [
                {
                    role: 'system',
                    // Упоминание схемы в промпте всё равно рекомендуется Яндексом
                    text: 'Проанализируй текст и верни ответ строго по переданной JSON-схеме.',
                },
                { role: 'user', text },
            ],
            // Схема передаётся отдельным параметром, а не в тексте промпта
            jsonSchema: {
                schema: {
                    type: 'object',
                    properties: {
                        sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                        topics: { type: 'array', items: { type: 'string' } },
                        summary: { type: 'string' },
                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                    },
                    required: ['sentiment', 'topics', 'summary', 'confidence'],
                },
            },
        })
    );

    let raw = '';
    for await (const chunk of stream) {
        raw = chunk.alternatives[0]?.message?.text ?? '';
    }

    return JSON.parse(raw) as AnalysisResult;
}
```

### Альтернатива — `jsonObject` (без схемы)

Если нужен просто валидный JSON без конкретной структуры:

```typescript
textGenerationService.CompletionRequest.fromPartial({
    // ...
    messages: [
        { role: 'system', text: 'Верни ответ в виде JSON-объекта.' },
        { role: 'user', text },
    ],
    jsonObject: true,  // вместо jsonSchema
})
```

### Сравнение подходов

| Подход | Когда использовать |
|--------|-------------------|
| `jsonSchema` | Нужна строгая структура — enum, required, типы полей |
| `jsonObject` | Нужен просто валидный JSON, структура не важна |
| Схема в промпте (старый способ) | Крайний случай, если SDK не поддерживает поле |

---

## Уровень 4 — Async-режим (Yandex Operations) для JSON-задачи

Используйте async-режим когда:
- Обрабатываете большой объём текста
- Не нужен мгновенный ответ
- Хотите получить `operationId` и проверить результат позже

```typescript
import { Session, waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';

async function extractJsonAsync<T>(inputText: string): Promise<T> {
    const asyncClient = session.client(
        textGenerationService.TextGenerationAsyncServiceClient
    );

    const request = textGenerationService.CompletionRequest.fromPartial({
        modelUri: `gpt://${folderId}/yandexgpt/latest`,
        completionOptions: { stream: false, temperature: 0.1, maxTokens: 2000 },
        messages: [
            {
                role: 'system',
                text: 'Отвечай ТОЛЬКО валидным JSON без markdown.',
            },
            { role: 'user', text: inputText },
        ],
    });

    // Запрос возвращает Operation немедленно
    const operation = await asyncClient.completion(request);
    console.log(`Задача создана: ${operation.id}`);

    // Ждём завершения
    const finished = await waitForOperation(operation, session);

    if (finished.error) {
        throw new Error(`Ошибка: ${finished.error.message}`);
    }

    const response = textGenerationService.CompletionResponse.decode(
        finished.response!.value
    );

    const rawText = response.alternatives[0]?.message?.text ?? '';
    return JSON.parse(rawText) as T;
}
```

---

## Уровень 5 — Обёртка для повторного использования

Готовая утилита для проекта, которая объединяет инициализацию из `yandex.config.ts`:

```typescript
// lib/yandex/ai/yandex-llm.ts
import { Session, waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';
import { getYandexConfig } from '../yandex.config.js';

export interface LlmOptions {
    temperature?: number;   // 0.0–1.0, по умолч. 0.3
    maxTokens?: number;     // по умолч. 2000
    systemPrompt?: string;
    async?: boolean;        // использовать async-режим Yandex
}

export async function callLlm(
    userText: string,
    options: LlmOptions = {}
): Promise<string> {
    const { apiKey, folderId } = getYandexConfig();
    const {
        temperature = 0.3,
        maxTokens = 2000,
        systemPrompt = 'Ты — полезный ассистент.',
        async: useAsync = false,
    } = options;

    const session = new Session({
        iamToken: '',
        headers: { Authorization: `Api-Key ${apiKey}` },
    });

    const request = textGenerationService.CompletionRequest.fromPartial({
        modelUri: `gpt://${folderId}/yandexgpt/latest`,
        completionOptions: { stream: false, temperature, maxTokens },
        messages: [
            { role: 'system', text: systemPrompt },
            { role: 'user', text: userText },
        ],
    });

    if (useAsync) {
        const asyncClient = session.client(
            textGenerationService.TextGenerationAsyncServiceClient
        );
        const op = await asyncClient.completion(request);
        const finished = await waitForOperation(op, session);
        const response = textGenerationService.CompletionResponse.decode(
            finished.response!.value
        );
        return response.alternatives[0]?.message?.text ?? '';
    }

    const syncClient = session.client(
        textGenerationService.TextGenerationServiceClient
    );
    let text = '';
    for await (const chunk of syncClient.completion(request)) {
        text = chunk.alternatives[0]?.message?.text ?? '';
    }
    return text;
}

// Специализированная функция для JSON-ответов
// schema — объект JSON Schema (передаётся нативным параметром jsonSchema, не в промпт)
export async function callLlmJson<T>(
    userText: string,
    options: Omit<LlmOptions, 'systemPrompt'> & { schema?: Record<string, unknown> } = {}
): Promise<T> {
    const { apiKey, folderId } = getYandexConfig();
    const {
        schema,
        temperature = 0.1,
        maxTokens = 2000,
        async: useAsync = false,
    } = options;

    const session = new Session({
        iamToken: '',
        headers: { Authorization: `Api-Key ${apiKey}` },
    });

    const request = textGenerationService.CompletionRequest.fromPartial({
        modelUri: `gpt://${folderId}/yandexgpt/latest`,
        completionOptions: { stream: false, temperature, maxTokens },
        messages: [
            {
                role: 'system',
                text: 'Верни ответ строго по переданной JSON-схеме. Без markdown.',
            },
            { role: 'user', text: userText },
        ],
        // Нативный параметр jsonSchema — не в промпт, а в поле запроса
        ...(schema ? { jsonSchema: { schema } } : { jsonObject: true }),
    });

    let rawText = '';

    if (useAsync) {
        const asyncClient = session.client(
            textGenerationService.TextGenerationAsyncServiceClient
        );
        const op = await asyncClient.completion(request);
        const finished = await waitForOperation(op, session);
        const response = textGenerationService.CompletionResponse.decode(
            finished.response!.value
        );
        rawText = response.alternatives[0]?.message?.text ?? '';
    } else {
        const syncClient = session.client(
            textGenerationService.TextGenerationServiceClient
        );
        for await (const chunk of syncClient.completion(request)) {
            rawText = chunk.alternatives[0]?.message?.text ?? '';
        }
    }

    return JSON.parse(rawText) as T;
}
```

```typescript
// Использование
import { callLlmJson } from './lib/yandex/ai/yandex-llm.js';

// Без схемы — модель вернёт любой валидный JSON
const data = await callLlmJson<{ name: string; price: number }>(
    'Извлеки название и цену: "Ноутбук ASUS — 89 990 руб."'
);

// Со схемой — модель гарантированно вернёт структуру по схеме
const data2 = await callLlmJson<{ name: string; price: number }>(
    'Извлеки название и цену: "Ноутбук ASUS — 89 990 руб."',
    {
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                price: { type: 'number' },
            },
            required: ['name', 'price'],
        },
    }
);

// С async-режимом Yandex и схемой
const data3 = await callLlmJson<MyType>(longText, { schema: mySchema, async: true });
```

---

## Справочник: модели YandexGPT

| modelUri | Описание |
|----------|---------|
| `gpt://{folderId}/yandexgpt/latest` | YandexGPT Pro — мощная, медленнее |
| `gpt://{folderId}/yandexgpt-lite/latest` | YandexGPT Lite — быстрее, дешевле |
| `gpt://{folderId}/yandexgpt/rc` | Release Candidate — новые версии |
| `ds://{modelId}` | Дообученная модель (Fine-tune) |

---

## Важные нюансы

- При `stream: false` модель всё равно возвращает несколько чанков через gRPC streaming, но каждый следующий содержит накопленный текст. **Берите последний чанк** или обновляйте переменную в цикле.
- `temperature: 0.1` даёт более стабильный JSON, чем дефолтные 0.6.
- Если модель добавляет markdown-обёртку (` ```json ``` `) несмотря на инструкции — удаляйте её: `raw.replace(/^```json\n?|\n?```$/g, '').trim()`.

---

*Следующий шаг: [05-ocr-vision.md](./05-ocr-vision.md)*
