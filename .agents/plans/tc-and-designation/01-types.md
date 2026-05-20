# TC & Designation — Типы

← [00-overview.md](./00-overview.md) | → [02-backend-logic.md](./02-backend-logic.md)

---

## Новые типы (`types/src/`)

### `product-type.ts`

```typescript
export type ProductType = {
    /** Краткое имя типа продукции, напр. "НЭМС", "Втулка". */
    name: string;
    /** Фразы и аналоги для матчинга из текста заявки клиента. */
    synonyms: string[];
};
```

---

### `technical-condition.ts`

```typescript
export type TechnicalCondition = {
    /** Ссылка на загруженный PDF ТУ — из него берётся FileContent. */
    fileId: string;
    /** Тип продукции, к которому относится это ТУ. */
    productTypeId: string;
    /** Правила, извлечённые из PDF воркером. Заполняются после TCWorker. */
    rules: TechnicalConditionRule[];
    /** Параметры условного обозначения. Определяет человек, ссылается на rules. */
    designationSlots: DesignationSlot[];
    /** Шаблоны отображения обозначения (полное, краткое и др.). */
    displayTemplates: DisplayTemplate[];
};

export type TechnicalConditionRule = {
    /** Уникальный идентификатор внутри TC. */
    id: string;
    /** Порядковый номер для сортировки в UI. */
    index: number;
    /** Заголовок раздела из ТУ, напр. "5.3 Климатическое исполнение". */
    title?: string;
    /** Текст правила. Таблицы хранятся как markdown-таблицы. */
    content: string;
};

export type DesignationSlot = {
    /** Позиция параметра в условном обозначении (0-based). */
    index: number;
    /** Название параметра, напр. "Климатическое исполнение". */
    name: string;
    /** Идентификаторы TechnicalConditionRule внутри этого TC. */
    ruleIds: string[];
};

export type DisplayTemplate = {
    /** Уникальный идентификатор внутри TC. */
    id: string;
    /** Читаемое название, напр. "Полное", "Краткое". */
    name: string;
    /** Индексы DesignationSlot.index, которые включаются в обозначение. */
    includedSlots: number[];
    /** Разделитель между частями обозначения, обычно "-". */
    separator: string;
};

/** Query для GET `/technical-conditions`. */
export type TechnicalConditionsQuery = {
    productTypeId?: string;
};
```

---

### `designation.ts`

```typescript
export type Designation = {
    /** TC по которому выполнялось определение. */
    tcId: string;
    /** Значения по каждому слоту. */
    values: DesignationValue[];
};

export type DesignationValue = {
    /** Соответствует DesignationSlot.index. */
    slotIndex: number;
    /** Итоговое значение параметра, напр. "700", "У1", "ВД". */
    value: string;
    /**
     * Уверенность LLM: 0–1.
     * Значения < 0.7 подсвечиваются в UI для ручной проверки.
     */
    confidence: number;
    /** Объяснение выбора значения — конструктор видит логику LLM. */
    reasoning: string;
};
```

---

## Изменения в существующих типах

### `order.ts` — расширение `OrderDetails`

```typescript
// Добавить в OrderDetails:

/** Тип продукции, определённый из заявки. */
productTypeId?: string;

/**
 * Условное обозначение.
 * ai — результат DesignationWorker.
 * human — ручная правка конструктора.
 */
designation?: Dual<Designation>;
```

---

### `worker.ts` — расширение `WorkerType` и `WorkerData`

```typescript
// WorkerType:
export type WorkerType =
    | 'yandex-ocr-worker'
    | 'llm-vision-worker'
    | 'order-details-worker'
    | 'tc-processing-worker'   // новый
    | 'designation-worker';    // новый

// Новые данные воркеров:

/**
 * Читает FileContent уже извлечённого PDF ТУ.
 * Вызывает Yandex LLM (async) → разбивает текст на TechnicalConditionRule[].
 * В apply() записывает правила в TechnicalCondition.rules.
 */
export type TCWorkerData = BaseWorkerData & {
    type: 'tc-processing-worker';
    /** TC, для которого извлекаются правила. */
    tcId: string;
    /** FileContent с извлечённым текстом PDF ТУ. */
    fileContentId: string;
    /** ID асинхронной операции Yandex — сохраняется для восстановления. */
    cloudOperationId?: string;
    /** JSON с TechnicalConditionRule[] — заполняется после завершения операции. */
    operationResult?: string;
    /** Сообщение об ошибке при неуспешном завершении. */
    errorMessage?: string;
};

/**
 * Читает rules через DesignationSlot.ruleIds + requirements из Order.
 * Вызывает Yandex LLM (async) → возвращает DesignationValue[].
 * В apply() записывает результат в Order.details.designation.ai.
 */
export type DesignationWorkerData = BaseWorkerData & {
    type: 'designation-worker';
    /** Заказ, для которого строится обозначение. */
    orderId: string;
    /** TC, по которому выполняется определение. */
    tcId: string;
    /** ID асинхронной операции Yandex — сохраняется для восстановления. */
    cloudOperationId?: string;
    /** JSON с DesignationValue[] — заполняется после завершения операции. */
    operationResult?: string;
    /** Сообщение об ошибке при неуспешном завершении. */
    errorMessage?: string;
};

// WorkerData union расширяется:
export type WorkerData =
    | YandexOcrWorkerData
    | LlmVisionWorkerData
    | OrderDetailsWorkerData
    | TCWorkerData
    | DesignationWorkerData;
```

---

## Новые коллекции БД (`back/data/`)

| Файл | Тип | Примечание |
|------|-----|-----------|
| `product-types.json` | `Stored<ProductType>[]` | Справочник типов продукции |
| `technical-conditions.json` | `Stored<TechnicalCondition>[]` | ТУ со вложенными rules, slots, templates |

`DisplayTemplate`, `DesignationSlot`, `TechnicalConditionRule` — вложены внутрь `TechnicalCondition`, отдельных коллекций не требуют.

---

## Экспорт из `types/src/index.ts`

Добавить реэкспорты:
```typescript
export * from './product-type.js';
export * from './technical-condition.js';
export * from './designation.js';
```

---

← [00-overview.md](./00-overview.md) | → [02-backend-logic.md](./02-backend-logic.md)
