# Yandex Cloud Node.js SDK — внутренний справочник

> Этот файл — рабочие заметки для ориентации в SDK. Обновляется по мере изучения.

---

## Ключевые импорты

```typescript
import { Session, waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { operationService } from '@yandex-cloud/nodejs-sdk/operation-v1';
```

---

## Тип Operation (полный интерфейс)

```typescript
// dist/generated/yandex/cloud/operation/operation.d.ts
interface Operation {
  id: string;
  description: string;
  createdAt?: Date;
  createdBy: string;     // ID пользователя/сервисного аккаунта
  modifiedAt?: Date;
  done: boolean;         // false = в процессе, true = завершена
  metadata?: Any;        // прогресс — бинарный Protobuf, зависит от сервиса
  error?: Status;        // { code: number; message: string; details: any[] }
  response?: Any;        // результат — бинарный Protobuf
}
```

### ⚠️ Критично: response и metadata — бинарные данные

`Any` = `{ typeUrl: string; value: Uint8Array }`.  
**Нельзя сохранить в JSON напрямую.**  
Для сохранения результата OCR в БД — декодировать вручную или использовать `getRecognition()`.

---

## waitForOperation — правильный способ ожидания

```typescript
// dist/utils/operation/wait-for.d.ts
waitForOperation(
  op: Operation,
  session: Session,
  timeoutMs?: number,
  operationServiceEndpoint?: string
): Promise<Operation>
```

Работает как polling под капотом: каждые `session.pollInterval` мс (по умолч. 1000мс) вызывает `OperationService.get()` до `done === true` или таймаута.

**Не писать свой polling — использовать этот метод.**

```typescript
const op = await asyncClient.recognize(request); // Operation { done: false }
const finished = await waitForOperation(op, session, 120_000); // ждём до 2 мин
if (finished.error) throw new Error(finished.error.message);
// finished.response — бинарный, нужно декодировать или использовать getRecognition
```

---

## Восстановление после перезапуска

Если `operation.id` сохранён в БД, но объект `Operation` недоступен в памяти:

```typescript
// OperationServiceClient — получить Operation по ID
const opClient = session.client(operationService.OperationServiceClient);
const op = await opClient.get(
  operationService.GetOperationRequest.fromPartial({ operationId: cloudOperationId })
);

if (op.done) {
  // Уже завершено — обрабатываем результат
} else {
  // Продолжаем ждать
  const finished = await waitForOperation(op, session);
}
```

---

## OCR Async — полный флоу

### Клиенты

| Клиент | Назначение |
|--------|-----------|
| `TextRecognitionServiceClient` | Синхронный OCR (стриминг страниц) |
| `TextRecognitionAsyncServiceClient` | Асинхронный OCR (через Operation) |

### TextRecognitionAsyncServiceClient — методы

```typescript
interface TextRecognitionAsyncServiceClient {
  // Запустить OCR → Operation (callback-style, но SDK промисифицирует через session.client())
  recognize(request: RecognizeTextRequest, ...): Operation;

  // Получить результат (стриминг страниц) — вызывать ПОСЛЕ done === true
  getRecognition(request: GetRecognitionRequest, ...): ClientReadableStream<RecognizeTextResponse>;
}
```

### RecognizeTextRequest

```typescript
interface RecognizeTextRequest {
  content: Buffer | undefined;   // бинарные данные файла
  mimeType: string;              // 'image/jpeg' | 'image/png' | 'application/pdf'
  languageCodes: string[];       // ['ru', 'en']
  model: string;                 // 'page' | 'template'
}
```

⚠️ Комментарий в .d.ts говорит "PDF не более 1 страницы" — это ограничение синхронного OCR.
Для async-режима лимит на страницы другой, нужно проверять в документации Яндекса.

### GetRecognitionRequest

```typescript
interface GetRecognitionRequest {
  operationId: string; // Operation.id от Яндекса
}
```

### RecognizeTextResponse (одна страница)

```typescript
interface RecognizeTextResponse {
  textAnnotation?: TextAnnotation; // весь текст + структура
  page: number;                    // номер страницы (0 для первой)
}

interface TextAnnotation {
  fullText: string;       // весь текст страницы
  blocks: Block[];        // текстовые блоки с координатами
  tables: Table[];        // таблицы
  entities: Entity[];     // распознанные сущности (даты, суммы и т.д.)
  width: number;
  height: number;
  rotate: Angle;
  markdown: string;       // только для моделей markdown/math-markdown
  pictures: Picture[];
}
```

### Полный async-флоу с waitForOperation

```typescript
import { Session, waitForOperation } from '@yandex-cloud/nodejs-sdk';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';
import { operationService } from '@yandex-cloud/nodejs-sdk/operation-v1';

const session = new Session({
  iamToken: '',
  headers: { Authorization: `Api-Key ${apiKey}` },
  pollInterval: 3000, // OCR обычно занимает несколько секунд
});

const asyncClient = session.client(ocrService.TextRecognitionAsyncServiceClient);

// 1. Запустить OCR
const op = await asyncClient.recognize(
  ocrService.RecognizeTextRequest.fromPartial({
    content: fileBuffer,
    mimeType: 'application/pdf',
    languageCodes: ['ru', 'en'],
    model: 'page',
  })
);
// op.done === false, op.id — сохранить в БД

// 2. Дождаться завершения
const finished = await waitForOperation(op, session, 120_000);
if (finished.error) throw new Error(finished.error.message);

// 3. Получить результат через getRecognition (не через finished.response!)
const resultStream = asyncClient.getRecognition(
  ocrService.GetRecognitionRequest.fromPartial({ operationId: op.id })
);

const pages: string[] = [];
for await (const page of resultStream) {
  if (page.textAnnotation?.fullText) {
    pages.push(page.textAnnotation.fullText);
  }
}
const text = pages.join('\n\n');
```

### Почему getRecognition, а не finished.response?

`finished.response` — это Protobuf Any с `Uint8Array`. Для OCR он содержит только первую страницу (или сводку).  
`getRecognition()` стримит **все страницы** отдельно, что правильно для многостраничных PDF.

---

## Session — конфигурация

```typescript
const session = new Session({
  iamToken: '',
  headers: { Authorization: `Api-Key ${apiKey}` },
  pollInterval: 3000,  // интервал polling в waitForOperation (мс)
});
```

`pollInterval` влияет только на `waitForOperation`. Значение по умолчанию — 1000мс.

---

## OperationServiceClient — управление операциями

```typescript
const opClient = session.client(operationService.OperationServiceClient);

// Получить Operation по ID (для восстановления после рестарта)
const op = await opClient.get(
  operationService.GetOperationRequest.fromPartial({ operationId: 'op-id' })
);

// Отменить операцию
await opClient.cancel(
  operationService.CancelOperationRequest.fromPartial({ operationId: 'op-id' })
);
```

---

## Краткая шпаргалка: что сохранять в БД

| Что | Сохранять? | Почему |
|-----|-----------|--------|
| `Operation.id` | ✅ | нужен для восстановления и getRecognition |
| `Operation.done` | ✅ | статус |
| `Operation.error.message` | ✅ | для отображения ошибки |
| `Operation.response` | ❌ | бинарный Uint8Array, не JSON |
| `Operation.metadata` | ❌ | бинарный Uint8Array, не JSON |
| `Operation.createdAt` | по необходимости | Date объект, сериализовать в timestamp |
| Декодированный текст | ✅ | результат getRecognition → fullText |
