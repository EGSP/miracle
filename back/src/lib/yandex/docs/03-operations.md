# Работа с Operations

## Концепция

**Operation** — это объект, который Yandex Cloud возвращает вместо результата, когда задача выполняется дольше нескольких секунд. Сервер обрабатывает запрос в фоне, а клиент периодически опрашивает статус.

```
Клиент                        Сервер
  │                              │
  │── asyncClient.method() ─────>│  сервер принимает задачу
  │<── Operation { id, done:false}│  немедленный ответ
  │                              │  (сервер обрабатывает в фоне)
  │── OperationService.get(id) ──>│
  │<── Operation { done: false } ─│  ещё не готово
  │                              │
  │── OperationService.get(id) ──>│
  │<── Operation { done: true,   ─│  готово
  │       response: ... }        │
```

Это **не JavaScript async/await** — это серверная концепция очереди задач.

---

## Уровень 1 — Структура объекта Operation

```typescript
interface Operation {
    id: string;          // уникальный ID операции
    description: string;
    createdAt: Timestamp;
    done: boolean;       // false = в процессе, true = завершена

    // Заполняется когда done = true:
    error?: Status;      // { code, message } — если ошибка
    response?: Any;      // { typeUrl, value: Uint8Array } — если успех
    metadata?: Any;      // прогресс выполнения (зависит от сервиса)
}
```

---

## Уровень 2 — waitForOperation: базовое ожидание

SDK предоставляет хелпер, который делает polling автоматически:

```typescript
import { Session, waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';

const session = new Session({ /* ... */ });
const asyncClient = session.client(
    textGenerationService.TextGenerationAsyncServiceClient
);

// 1. Отправляем запрос — получаем Operation немедленно
const operation = await asyncClient.completion(
    textGenerationService.CompletionRequest.fromPartial({ /* ... */ })
);

console.log(`Operation запущена: ${operation.id}`);
console.log(`Выполнена: ${operation.done}`); // false

// 2. Ждём завершения (polling каждые pollInterval мс, по умолч. 1000мс)
const finished = await waitForOperation(operation, session);

// 3. Проверяем результат
if (finished.error) {
    throw new Error(`Ошибка операции: ${finished.error.message}`);
}

if (finished.response) {
    // response.value — бинарные данные, нужно декодировать
    const result = textGenerationService.CompletionResponse.decode(
        finished.response.value
    );
    console.log(result.alternatives[0].message.text);
}
```

---

## Уровень 3 — Настройка интервала polling

`pollInterval` задаётся в конфиге Session (в миллисекундах):

```typescript
const session = new Session({
    iamToken: '',
    headers: { Authorization: `Api-Key ${apiKey}` },
    pollInterval: 2000, // опрашивать каждые 2 секунды (по умолч. 1000)
});
```

---

## Уровень 4 — Ручной polling (расширенный контроль)

Если нужно отслеживать прогресс или реализовать таймаут вручную:

```typescript
import { operationService } from '@yandex-cloud/nodejs-sdk/operation-v1';

const opClient = session.client(operationService.OperationServiceClient);

async function waitWithTimeout(
    operationId: string,
    timeoutMs: number
): Promise<operationService.Operation> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const op = await opClient.get(
            operationService.GetOperationRequest.fromPartial({ operationId })
        );

        if (op.done) return op;

        // Логируем прогресс если есть metadata
        if (op.metadata) {
            console.log(`Прогресс: ${JSON.stringify(op.metadata)}`);
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error(`Операция ${operationId} не завершилась за ${timeoutMs}мс`);
}

// Использование
const op = await asyncClient.completion(request);
const finished = await waitWithTimeout(op.id, 60_000);
```

---

## Уровень 5 — Утилита декодирования ответа

Поле `response` в Operation содержит бинарные данные Protobuf. Каждый сервис декодирует в свой тип:

```typescript
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';

function decodeOperationResponse<T>(
    operation: { response?: { value: Uint8Array } },
    decoder: { decode: (data: Uint8Array) => T }
): T {
    if (!operation.response) {
        throw new Error('Operation не содержит response');
    }
    return decoder.decode(operation.response.value);
}

// Декодирование ответа YandexGPT
const llmResult = decodeOperationResponse(
    finished,
    textGenerationService.CompletionResponse
);

// Декодирование ответа OCR
const ocrResult = decodeOperationResponse(
    finished,
    ocrService.RecognizeTextResponse
);
```

---

## Когда использовать sync vs async (Operation)

| Критерий | Sync (streaming) | Async (Operation) |
|---------|-----------------|-------------------|
| Интерактивный чат с live-ответом | ✅ | ❌ |
| Batch-обработка множества файлов | ❌ | ✅ |
| Длинные документы / большой контекст | ❌ | ✅ |
| Простой запрос-ответ без UI | ✅ или ✅ | оба варианта |
| Нужен ID задачи для последующей проверки | ❌ | ✅ |

---

*Следующий шаг: [04-ai-text-generation.md](./04-ai-text-generation.md)*
