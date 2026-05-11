# TypeScript-типизация клиентов SDK

## Проблема: типы из proto vs. runtime-поведение

TypeScript-декларации в `@yandex-cloud/nodejs-sdk` **сгенерированы автоматически** из `.proto`-файлов через `protoc`. gRPC по стандарту — callback-based API, поэтому все unary-методы (один запрос → один ответ) описаны в `.d.ts` так:

```typescript
// Что написано в .d.ts SDK:
recognize(
    request: RecognizeTextRequest,
    callback: (error: ServiceError | null, response: Operation) => void
): ClientUnaryCall;
```

Yandex SDK поверх этого добавляет промисификацию в рантайме внутри `session.client()`. Типы при этом **не обновляются** — они остаются callback-API, хотя реально метод возвращает `Promise`.

Итог: если написать `await asyncClient.recognize(req)` — код работает, но TypeScript видит ошибку типов, потому что по `.d.ts` метод не возвращает `Promise`.

---

## Когда это затрагивает

Только **unary-вызовы** — методы, где один запрос даёт один ответ.

**Стримы** (`ClientReadableStream`) в SDK типизированы корректно — они не промисифицируются и работают из коробки:

```typescript
// Стрим — работает без обёрток, тип выводится правильно:
const stream = asyncClient.getRecognition({ operationId });
for await (const page of stream) { ... } // page: RecognizeTextResponse ✅
```

---

## Решение: локальный тип с runtime-сигнатурами

Для каждого сервиса с unary-вызовами определяем тип, который описывает **фактическое поведение** — с `Promise` вместо callback:

```typescript
type AsyncOcrClient = {
    // Unary → Promise (фактическое runtime-поведение)
    recognize(request: RecognizeTextRequest & { folderId?: string }): Promise<Operation>;
    // Stream — из оригинального интерфейса, типизирован корректно
    getRecognition(request: GetRecognitionRequest): AsyncIterable<RecognizeTextResponse>;
};

// При создании клиента — приводим тип:
const client = session.client(
    ocrService.TextRecognitionAsyncServiceClient
) as unknown as AsyncOcrClient;
```

Двойное приведение (`as unknown as AsyncOcrClient`) необходимо, потому что типы несовместимы структурно — это намеренное расхождение между декларациями SDK и рантаймом.

---

## Заметка про folderId

Поле `folderId` **не описано** в proto-контракте `RecognizeTextRequest` (его нет в `.d.ts`), но gRPC-сервис Яндекса принимает его через механизм неизвестных полей proto3. Поэтому в локальном типе `folderId` добавляется через пересечение:

```typescript
request: RecognizeTextRequest & { folderId?: string }
```

---

## Паттерн для нового сервиса

При добавлении нового Yandex-сервиса с unary-вызовами:

1. Найти нужный `ServiceClient` в `@yandex-cloud/nodejs-sdk/<service-name>`
2. Посмотреть какие методы unary (не стримовые)
3. Добавить тип в `yandex-sdk.types.ts`:

```typescript
export type AsyncMyServiceClient = {
    // unary-метод → Promise
    myUnaryMethod(request: MyRequest): Promise<MyResponse>;
    // stream-метод → оставить как есть из оригинального интерфейса
    myStreamMethod(request: MyStreamRequest): AsyncIterable<MyStreamResponse>;
};
```

4. При создании клиента:

```typescript
const client = session.client(
    myService.MyServiceClient
) as unknown as AsyncMyServiceClient;
```

---

## Расположение типов

Все промисифицированные типы клиентов хранятся в одном файле:

```
back/src/lib/yandex/yandex-sdk.types.ts
```

Не определять их локально в воркерах или роутерах — чтобы одно расхождение SDK/runtime было задокументировано в одном месте.

---

*Связанные документы: [02-auth-and-client.md](./02-auth-and-client.md), [03-operations.md](./03-operations.md)*
