# Аутентификация и инициализация клиента

## Концепция

SDK использует объект `Session` как центральную точку конфигурации. Session хранит учётные данные и создаёт типизированные клиенты для конкретных сервисов.

```
Session (учётные данные)
    └── session.client(ServiceClient)  →  типизированный клиент сервиса
            └── client.method(request)  →  ответ / Operation / stream
```

---

## Уровень 1 — API-ключ через Bearer (текущий подход проекта)

API-ключ передаётся напрямую как значение `iamToken`. SDK отправляет `Authorization: Bearer <iamToken>` при каждом gRPC-запросе. Yandex Cloud различает тип токена по префиксу: IAM-токены начинаются с `t1.`, API-ключи — с `AQVN`. Оба формата принимаются в Bearer-заголовке.

```typescript
import { Session } from '@yandex-cloud/nodejs-sdk';

const session = new Session({
    iamToken: process.env.YANDEX_CLOUD_API_KEY,
});
```

> **Почему не `headers: { Authorization: 'Api-Key ...' }`:** SDK явно пропускает ключ
> `authorization` при обработке кастомных `headers` (см. `session.js`, метод
> `newChannelCredentials`), поэтому такой подход не работает.

---

## Уровень 2 — Другие методы аутентификации

### IAM-токен (ручной, краткосрочный)

```typescript
// IAM-токен живёт 12 часов, получается через OAuth или CLI
const session = new Session({ iamToken: 't1.9eАА...' });
```

### Service Account JSON (для продакшена)

```typescript
import fs from 'fs';

const session = new Session({
    serviceAccountJson: {
        serviceAccountId: 'aje...',
        accessKeyId: 'aje...',
        privateKey: fs.readFileSync('./authorized_key.pem'),
    },
});
// SDK сам обновляет IAM-токен по мере истечения
```

### Metadata Service (для VM / Cloud Functions)

```typescript
// Без параметров — токен берётся из метаданных инстанса
const session = new Session();
```

---

## Уровень 3 — Создание клиентов сервисов

`session.client()` принимает класс клиента из сгенерированных модулей SDK и возвращает полностью типизированный экземпляр.

### Паттерн использования

```typescript
import { Session } from '@yandex-cloud/nodejs-sdk';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';
import { ocrService } from '@yandex-cloud/nodejs-sdk/ai-ocr-v1';

const session = new Session({
    iamToken: '',
    headers: { Authorization: `Api-Key ${process.env.YANDEX_CLOUD_API_KEY}` },
});

// Клиент YandexGPT — синхронный (streaming)
const llmClient = session.client(
    textGenerationService.TextGenerationServiceClient
);

// Клиент YandexGPT — асинхронный (через Operation)
const llmAsyncClient = session.client(
    textGenerationService.TextGenerationAsyncServiceClient
);

// Клиент OCR — синхронный (streaming)
const ocrClient = session.client(
    ocrService.TextRecognitionServiceClient
);

// Клиент OCR — асинхронный (через Operation)
const ocrAsyncClient = session.client(
    ocrService.TextRecognitionAsyncServiceClient
);
```

### Переопределение эндпоинта

```typescript
// Второй аргумент — кастомный хост:порт
const client = session.client(
    textGenerationService.TextGenerationServiceClient,
    'llm.api.cloud.yandex.net:443'
);
```

---

## Уровень 4 — Вынос в конфигурацию (рекомендуемый паттерн)

Оберните Session в singleton, чтобы не создавать новый экземпляр при каждом запросе:

```typescript
// lib/yandex/yandex.session.ts
import { Session } from '@yandex-cloud/nodejs-sdk';
import { getYandexConfig } from './yandex.config.js';

let _session: Session | null = null;

export function getYandexSession(): Session {
    if (_session) return _session;

    const { apiKey } = getYandexConfig();

    _session = new Session({
        iamToken: '',
        headers: { Authorization: `Api-Key ${apiKey}` },
    });

    return _session;
}
```

```typescript
// Использование в любом месте приложения
import { getYandexSession } from '../lib/yandex/yandex.session.js';
import { textGenerationService } from '@yandex-cloud/nodejs-sdk/ai-foundation-models-v1';

const client = getYandexSession().client(
    textGenerationService.TextGenerationServiceClient
);
```

---

## Справочник: клиентские классы по сервисам

| Сервис | Импорт | Клиент |
|--------|--------|--------|
| YandexGPT sync | `@yandex-cloud/nodejs-sdk/ai-foundation-models-v1` | `textGenerationService.TextGenerationServiceClient` |
| YandexGPT async | `@yandex-cloud/nodejs-sdk/ai-foundation-models-v1` | `textGenerationService.TextGenerationAsyncServiceClient` |
| Embeddings | `@yandex-cloud/nodejs-sdk/ai-foundation-models-v1` | `embeddingService.EmbeddingsServiceClient` |
| OCR sync | `@yandex-cloud/nodejs-sdk/ai-ocr-v1` | `ocrService.TextRecognitionServiceClient` |
| OCR async | `@yandex-cloud/nodejs-sdk/ai-ocr-v1` | `ocrService.TextRecognitionAsyncServiceClient` |

---

*Следующий шаг: [03-operations.md](./03-operations.md)*
