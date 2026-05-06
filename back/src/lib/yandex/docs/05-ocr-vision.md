# OCR / Vision — распознавание текста

## Концепция

Yandex Cloud предоставляет два сервиса для работы с изображениями:

| Сервис | Что делает |
|--------|-----------|
| **OCR (новый)** — `ai-ocr-v1` | Распознавание текста, таблиц, структуры документа |
| **Vision (старый)** — `ai-vision-v3` | OCR + классификация + лица + качество изображения |

Для большинства задач рекомендуется новый OCR. Vision используется если нужны дополнительные фичи (детектирование лиц, классификаторы).

---

## Уровень 1 — Синхронный OCR: распознать изображение

Простейший случай: файл с диска → текст.

```typescript
import { Session } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import fs from 'fs';

const session = new Session({
    iamToken: '',
    headers: { Authorization: `Api-Key ${process.env.YANDEX_CLOUD_API_KEY}` },
});

const client = session.client(ocrService.TextRecognitionServiceClient);
const imageBuffer = fs.readFileSync('./document.jpg');

const stream = client.recognize(
    ocrService.RecognizeTextRequest.fromPartial({
        content: imageBuffer,         // Uint8Array / Buffer
        mimeType: 'image/jpeg',       // 'image/jpeg' | 'image/png' | 'application/pdf'
        languageCodes: ['ru', 'en'],  // ISO 639-1, порядок влияет на приоритет
        model: 'page',                // 'page' — общий | 'template' — по шаблону
    })
);

// stream — async iterable, один чанк = одна страница документа
for await (const page of stream) {
    console.log(page.textAnnotation?.fullText);
}
```

---

## Уровень 2 — Извлечение структурированных данных

`textAnnotation` содержит не только полный текст, но и блоки, строки, слова с координатами:

```typescript
for await (const page of stream) {
    const annotation = page.textAnnotation;
    if (!annotation) continue;

    console.log('=== Полный текст ===');
    console.log(annotation.fullText);

    console.log('\n=== По блокам ===');
    for (const block of annotation.blocks) {
        for (const line of block.lines) {
            // line.text — текст строки
            // line.boundingBox — координаты прямоугольника на изображении
            console.log(line.text);
        }
    }

    console.log('\n=== По словам с уверенностью ===');
    for (const block of annotation.blocks) {
        for (const line of block.lines) {
            for (const word of line.words) {
                // word.confidence — уверенность распознавания (0–1)
                if ((word.confidence ?? 1) < 0.8) {
                    console.warn(`Низкая уверенность: "${word.text}"`);
                }
            }
        }
    }
}
```

---

## Уровень 3 — Async OCR (через Operation)

Используйте для больших PDF или когда не нужен мгновенный ответ:

```typescript
import { Session } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import fs from 'fs';

const asyncClient = session.client(ocrService.TextRecognitionAsyncServiceClient);
const pdfBuffer = fs.readFileSync('./contract.pdf');

// 1. Запускаем задачу
const operation = await asyncClient.recognize(
    ocrService.RecognizeTextRequest.fromPartial({
        content: pdfBuffer,
        mimeType: 'application/pdf',
        languageCodes: ['ru'],
        model: 'page',
    })
);

console.log(`OCR задача запущена: ${operation.id}`);

// 2. Получаем результат через getRecognition (стриминг по страницам)
const resultStream = asyncClient.getRecognition(
    ocrService.GetRecognitionRequest.fromPartial({
        operationId: operation.id,
    })
);

for await (const page of resultStream) {
    console.log(`Страница ${page.page}: ${page.textAnnotation?.fullText}`);
}
```

> `getRecognition` можно вызвать позже — достаточно сохранить `operation.id`.

---

## Уровень 4 — OCR из URL и base64

```typescript
// Из URL (публично доступное изображение)
const requestFromUrl = ocrService.RecognizeTextRequest.fromPartial({
    uri: 'https://example.com/image.jpg',  // вместо content
    mimeType: 'image/jpeg',
    languageCodes: ['ru'],
});

// Из base64 строки (например, пришла из фронтенда)
function base64ToBuffer(base64: string): Buffer {
    // Убираем префикс data URI если он есть
    const data = base64.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(data, 'base64');
}

const requestFromBase64 = ocrService.RecognizeTextRequest.fromPartial({
    content: base64ToBuffer(base64String),
    mimeType: 'image/png',
    languageCodes: ['ru', 'en'],
});
```

---

## Уровень 5 — Обёртка: OCR → string

Готовая утилита, возвращающая весь текст документа:

```typescript
// lib/yandex/ocr/yandex-ocr.ts
import { Session } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { getYandexConfig } from '../yandex.config.js';

type MimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

export interface OcrOptions {
    languages?: string[];   // по умолч. ['ru', 'en']
    model?: 'page' | 'template';  // по умолч. 'page'
    async?: boolean;        // по умолч. false
}

export async function recognizeText(
    content: Buffer | Uint8Array,
    mimeType: MimeType,
    options: OcrOptions = {}
): Promise<string> {
    const { apiKey } = getYandexConfig();
    const {
        languages = ['ru', 'en'],
        model = 'page',
        async: useAsync = false,
    } = options;

    const session = new Session({
        iamToken: '',
        headers: { Authorization: `Api-Key ${apiKey}` },
    });

    const request = ocrService.RecognizeTextRequest.fromPartial({
        content,
        mimeType,
        languageCodes: languages,
        model,
    });

    const pages: string[] = [];

    if (useAsync) {
        const asyncClient = session.client(
            ocrService.TextRecognitionAsyncServiceClient
        );
        const op = await asyncClient.recognize(request);
        const resultStream = asyncClient.getRecognition(
            ocrService.GetRecognitionRequest.fromPartial({ operationId: op.id })
        );
        for await (const page of resultStream) {
            if (page.textAnnotation?.fullText) {
                pages.push(page.textAnnotation.fullText);
            }
        }
    } else {
        const syncClient = session.client(
            ocrService.TextRecognitionServiceClient
        );
        for await (const page of syncClient.recognize(request)) {
            if (page.textAnnotation?.fullText) {
                pages.push(page.textAnnotation.fullText);
            }
        }
    }

    return pages.join('\n\n');
}
```

```typescript
// Использование
import { recognizeText } from './lib/yandex/ocr/yandex-ocr.js';
import fs from 'fs';

// Изображение
const imageText = await recognizeText(
    fs.readFileSync('./receipt.jpg'),
    'image/jpeg'
);

// Многостраничный PDF
const pdfText = await recognizeText(
    fs.readFileSync('./contract.pdf'),
    'application/pdf',
    { async: true, languages: ['ru'] }
);
```

---

## Уровень 6 — OCR + LLM pipeline

Типичный кейс: распознать документ и извлечь из него структурированные данные:

```typescript
import { recognizeText } from './lib/yandex/ocr/yandex-ocr.js';
import { callLlmJson } from './lib/yandex/ai/yandex-llm.js';
import fs from 'fs';

interface InvoiceData {
    invoiceNumber: string;
    date: string;
    supplier: string;
    totalAmount: number;
    currency: string;
    items: Array<{ name: string; quantity: number; price: number }>;
}

async function extractInvoiceData(imagePath: string): Promise<InvoiceData> {
    // Шаг 1: OCR — изображение → текст
    const rawText = await recognizeText(
        fs.readFileSync(imagePath),
        'image/jpeg'
    );

    // Шаг 2: LLM — текст → JSON
    return callLlmJson<InvoiceData>(
        `Извлеки данные из счёта-фактуры:\n\n${rawText}`,
        {
            temperature: 0.1,
            schema: JSON.stringify({
                type: 'object',
                properties: {
                    invoiceNumber: { type: 'string' },
                    date: { type: 'string', description: 'формат DD.MM.YYYY' },
                    supplier: { type: 'string' },
                    totalAmount: { type: 'number' },
                    currency: { type: 'string' },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                quantity: { type: 'number' },
                                price: { type: 'number' },
                            },
                        },
                    },
                },
            }),
        }
    );
}

// Использование
const invoice = await extractInvoiceData('./invoice.jpg');
console.log(invoice);
```

---

## Справочник: параметры OCR

| Параметр | Значения | Описание |
|---------|---------|---------|
| `mimeType` | `image/jpeg`, `image/png`, `application/pdf` | Формат файла |
| `languageCodes` | `['ru']`, `['ru', 'en']`, `['en']` | Языки распознавания |
| `model` | `page`, `template` | `page` — обычный текст, `template` — стандартизированные формы |
| `content` | `Buffer` / `Uint8Array` | Бинарные данные файла |
| `uri` | `string` | URL публично доступного файла (вместо `content`) |

---

*Вернуться к началу: [01-setup.md](./01-setup.md)*
