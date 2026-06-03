# План: джоб `extract-positions-from-chunk`

## Цель

Шаг A пайплайна обработки приложений: на вход подаётся **чанк данных** (JSON-объект, кусок таблицы/текста) и `applicationId`. Джоб асинхронно обращается к Yandex LLM (системный промпт + каталог типов продукции с синонимами + чанк, по JSON-схеме), получает **массив позиций** и записывает их в БД как `OrderPosition`.

Интерпретация требований и условного обозначения — НЕ здесь, а на последующих шагах (ТУ / `designation-analyse`). Этот шаг только **верно захватывает и сегментирует** позиции и классифицирует тип по справочнику.

## Архитектурные решения (зафиксировано с заказчиком)

- Вызов Yandex — **листовой джоб** через `submitOnce` + `pollUntilDone`; `opId` хранится в **`memo`** (идемпотентность отправки), отдельного дочернего джоба под операцию не заводим. Паттерн зеркалит `order-analyse` / `designation-analyse`.
- Выход LLM — массив, **обёрнутый в объект** `{ positions: [...] }` (модели стабильнее отдают объект, чем голый массив).
- Yandex не допускает `.optional` — **только явный `.nullable()`**. `alternatives` всегда присутствует (может быть пустым), `confidence` — enum без nullable.
- `maxTokens` выносим в **общий справочник-константу** (единый максимум для всех LLM-вызовов).
- Идемпотентность записи: при перезапуске незавершённого джоба — **перезапись того, что записал ИМЕННО этот прогон** (id отслеживаются в `memo`), а не всех позиций приложения (иначе соседние чанки того же `applicationId` затрутся). Конкурентной отправки на то же приложение нет.

---

## 1. Новый тип `OrderPosition` (`types/src/order-position.ts`)

Старую форму (`requirements: PositionRequirement[]`, плоский `designation`) **удаляем целиком**. Новая:

```ts
import type { Designation } from './designation.js';

export type OrderPositionConfidence = 'high' | 'medium' | 'low';

/** Полезные данные позиции, не используемые как идентификаторы/для выборок. Хранится как JSON. */
export type OrderPositionData = {
    /** Дословный текст требований/шифра для этой позиции; null если требований нет. */
    requirements: string | null;
    /** Единица измерения verbatim ("шт", "м", "компл"); null если не указана. */
    unit: string | null;
    /** Количество verbatim ("10", "по 5", "5-10"); null если не указано. */
    quantity: string | null;
    /** Взаимозаменяемые варианты (аналоги разных производителей); [] если нет. */
    alternatives: string[];
    /** Уверенность в ВЫДЕЛЕНИИ позиции (сегментация), не в типе. */
    confidence: OrderPositionConfidence;
    /** Чем вызвана неуверенность; null если уверен. */
    confidenceNote: string | null;
    /** Условное обозначение — заполняется позже шагом designation-analyse. */
    designation?: Designation;
};

export type OrderPosition = {
    applicationId: string;
    /** Дословное название/обозначение от заказчика. */
    name: string;
    /** Тип продукции из справочника; null-поля если не из нашей номенклатуры или тип не определён. */
    productType?: { id: string | null; name: string | null };
    data: OrderPositionData;
};

export type OrderPositionQuery = {
    id?: string;
    applicationId?: string;
};
```

- `PositionRequirement` — **удалить** (тип и все импорты).
- `designation` переезжает внутрь `data` (это «прочее» поле; `designation-analyse` будет обновлять `data.designation`).

## 2. Prisma-миграция (`back-nest/prisma/schema.prisma`)

Модель `OrderPosition` → новые колонки:

```prisma
model OrderPosition {
  id              String  @id @default(uuid())
  applicationId   String
  name            String
  productTypeId   String?     // для выборок/маршрутизации шага B
  productTypeName String?     // денормализованный снимок
  data            Json        // OrderPositionData

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([applicationId])
  @@map("order_positions")
}
```

- Убрать `requirements Json?` и `designation Json?`.
- Добавить `name`, `data`. `productTypeId`/`productTypeName` оставляем колонками (нужны для фильтрации/шага ТУ); в TS-типе они мапятся в `productType.{id,name}`.
- Сгенерировать миграцию (`prisma migrate dev`). Данных в проде нет / допускается сброс — отдельную data-миграцию не пишем.

## 3. Справочник лимита токенов (`back-nest/src/common/llm-limits.ts`, новый)

```ts
/** Единый максимум выходных токенов для всех LLM-вызовов (предел модели YandexGPT). */
export const LLM_MAX_OUTPUT_TOKENS = 32_000; // TODO: выставить под реальный лимит yandexgpt-5.1/latest
```

- Использовать в новом джобе.
- (Опционально, отдельной задачей) перевести `order-analyse` / `designation-analyse` / vision-джобы на эту же константу вместо `countTokens(...) * N`.

## 4. Новый джоб (`back-nest/src/jobs/implementations/order/extract-positions-from-chunk.job.ts`)

### Вход
```ts
type ExtractInput = { applicationId: string; chunk: unknown };
```

### Zod-схема выхода
```ts
const PositionZodSchema = z.object({
  productType: z.object({
    id: z.string().nullable().describe('id типа из справочника или null'),
    name: z.string().nullable().describe('name типа из справочника или null'),
  }).nullable().describe('Тип продукции из справочника; null если не из нашей номенклатуры или не определён'),
  name: z.string().describe('Дословное название/обозначение от заказчика'),
  requirements: z.string().nullable().describe('Дословный текст требований/шифр; null если нет'),
  unit: z.string().nullable().describe('Единица измерения verbatim; null'),
  quantity: z.string().nullable().describe('Количество verbatim; null'),
  alternatives: z.array(z.string()).describe('Взаимозаменяемые варианты (аналоги разных производителей); [] если нет'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Уверенность в выделении позиции'),
  confidence_note: z.string().nullable().describe('Чем вызвана неуверенность; null'),
});
const PositionsZodSchema = z.object({ positions: z.array(PositionZodSchema) });
const PositionsJsonSchema = z.toJSONSchema(PositionsZodSchema) as Record<string, unknown>;
```

### Системный промпт `buildSystemPrompt(catalog)`
База + блок каталога типов с синонимами + правила сегментации:
- Извлекай **все** позиции, в т.ч. продукцию вне справочника → `productType: null`. Не фильтруй.
- Одна ячейка/строка с **разными** продуктами → **раздели** на отдельные позиции.
- Одна ячейка с несколькими обозначениями **одного и того же** изделия (аналоги разных производителей, любой подходит) → **одна** позиция: основное в `name`, остальные в `alternatives`. Дубли не плодить.
- Различитель: взаимозаменяемые варианты одного изделия (один тип, одно назначение) → одна позиция с `alternatives`; разные изделия → разные позиции.
- Требования/шифр — захватывай **дословно** в `requirements`, не интерпретируй и не разворачивай.
- `confidence` — уверенность в **выделении** позиции, не в типе.
- Ответ строго JSON по схеме, без markdown.

### Тело джоба (паттерн `order-analyse`)
```
root: extract-positions-from-chunk
 ├─ llm  → Position[]   (submitOnce: opId в memo; pollUntilDone; temperature 0.1; maxTokens: LLM_MAX_OUTPUT_TOKENS; jsonSchema: PositionsJsonSchema)
 └─ apply → пишет позиции
```

- `llm`: тянет `productTypes.getAll()`, строит system, `JSON.stringify(input.chunk)` в user, отправляет, опрашивает, парсит `PositionsZodSchema`, возвращает `positions`.
- **Резолв типа**: каждый `productType.{id,name}` из ответа сверять с каталогом (по id, затем по name/синониму — как `resolveProductType` в `order-analyse`), чтобы не записать галлюцинированный id; не совпало → `productType` с null-полями.
- Маппинг `Position → OrderPosition`: `name`, `productType`, `data: { requirements, unit, quantity, alternatives, confidence, confidenceNote: confidence_note }`. `applicationId` из входа.
- `apply` (идемпотентность по прогону):
  1. Если в `memo` есть `createdIds` (был частичный/полный прогон) — удалить эти строки (`deleteMany`), чтобы перезапись была чистой.
  2. Создать все позиции; собрать новые id; сохранить `createdIds` в `memo`.
  - Удаление **только своих** строк (по id из memo), НЕ по `applicationId` — иначе затрём позиции от других чанков того же приложения.

### Регистрация
- `back-nest/src/jobs/job-implementations.module.ts`: импорт + добавить `ExtractPositionsFromChunkJob` в `providers`. Нужные модули (`OrdersModule`, `ProductTypesModule`) уже импортированы; `YandexService` глобальный.
- Конструктор инжектит: `OrderPositionsService`, `ProductTypesService`, `YandexService`.
- Запуск потребителем — `JobsService.start('extract-positions-from-chunk', { applicationId, chunk })`.

## 5. `OrderPositionsService` (`back-nest/src/orders/order-positions.service.ts`)

- `create(input: OrderPosition)`: писать `name`, `productTypeId = input.productType?.id`, `productTypeName = input.productType?.name`, `data = input.data`.
- `update`: патч по новым полям (`name`, `productType`, `data`); для `designation-analyse` — обновление `data.designation` (merge внутрь `data`).
- Добавить `deleteMany(ids: string[]): Promise<void>` (hard delete) — для перезаписи в `apply`.
- `listByApplication` / `get` — маппинг строки в новый `OrderPosition` (flat колонки → `productType` объект).

## 6. Downstream-правки (обязательно, иначе сборка падёт)

- **`designation-analyse.job.ts`** → `formatRequirements`: читать `position.data.requirements` (**текст**, не массив `parameterName/requiredValue`). Переписать формирование блока «ТРЕБОВАНИЯ ЗАКАЗЧИКА» под текст. `apply` пишет `data.designation` вместо плоского `designation`.
- **`order-analyse.job.ts`** — старый пайплайн (одна позиция из `FileContent`-текста через `getApplicationText`). Конфликтует с новой моделью (`flatToPosition`, `OrderPosition.requirements`-массив). Действие: пометить на рефактор/удаление в рамках перехода на построчное чтение. **Вынести решение отдельно** — не блокирует текущий джоб, но перестанет компилироваться → как минимум обновить маппинг или временно отключить.
- **`types/src/worker.ts`** — использует `OrderPosition`; проверить и поправить под новую форму.
- **Легаси `back/src/app/generated/*`** (`parsers.generated`, `validation-map.generated`) — если проект `back` ещё потребляет `@miracle/types`, перегенерировать или зафиксировать, что `back` выводится из эксплуатации.

## 7. Порядок выполнения

1. `types`: новый `OrderPosition` + `OrderPositionData`, удалить `PositionRequirement`. Сборка `types`.
2. Prisma: схема + миграция + `prisma generate`.
3. `OrderPositionsService`: create/update/deleteMany/маппинг.
4. `llm-limits.ts` константа.
5. Новый джоб + регистрация в модуле.
6. Правки `designation-analyse`, `order-analyse`, `worker.ts`.
7. Сборка back-nest, прогон типов/линта.

## 8. Открытые вопросы (вне объёма этого джоба)

- **Кто нарезает приложение на чанки** и вызывает джоб (продьюсер построчного чтения таблицы) — отдельная задача.
- Судьба `order-analyse` при переходе на построчный пайплайн (рефактор vs удаление).
- Реальный лимит `LLM_MAX_OUTPUT_TOKENS` для `yandexgpt-5.1/latest`.
