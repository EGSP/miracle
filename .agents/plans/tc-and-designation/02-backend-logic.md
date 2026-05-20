# TC & Designation — Бэкенд: логика и взаимодействия

← [01-types.md](./01-types.md) | → [03-ui.md](./03-ui.md)

---

## Новые сервисы (`back/src/databases/`)

По аналогии с существующими (filesService, ordersService и т.п.).

### `productTypesService`

```
Файл: back/src/databases/product-types.service.ts
БД:   back/data/product-types.json

Методы:
  create(data)                    → Stored<ProductType>
  getAll()                        → Stored<ProductType>[]
  getById(id)                     → Stored<ProductType> | undefined
  update(id, patch)               → Stored<ProductType>
  delete(id)                      → void
  findByName(name)                → Stored<ProductType> | undefined
```

### `technicalConditionsService`

```
Файл: back/src/databases/technical-condition.db.ts
БД:   back/data/technical-conditions.json

Методы (базовый CRUD без удаления и без отдельных операций по вложениям):
  create(data)                         → Stored<TechnicalCondition>
  getAll()                             → Stored<TechnicalCondition>[]
  getById(id)                          → Stored<TechnicalCondition> | undefined
  getByProductTypeId(productTypeId)    → Stored<TechnicalCondition>[]
  replace(id, data)                    → Stored<TechnicalCondition>   // полный объект TechnicalCondition
```

Отдельные эндпоинты на правки `rules` / `designationSlots` / `displayTemplates` не используются: клиент передаёт целиком объект `TechnicalCondition` через `PUT /:id` (см. ниже). Удаление TC и воркеры (`POST …/process`) — вне текущей итерации.

---

## Новые роутеры (`back/src/routers/`)

### `/product-types`

| Метод | Путь | Действие |
|-------|------|---------|
| GET | `/` | Список всех типов продукции |
| POST | `/` | Создать тип |
| GET | `/:id` | Получить по id |
| PATCH | `/:id` | Обновить (name, synonyms) |
| DELETE | `/:id` | Удалить |

### `/technical-conditions`

| Метод | Путь | Действие |
|-------|------|---------|
| GET | `/` | Список (опциональный query: `?productTypeId=` — только ТУ этого типа продукции) |
| POST | `/` | Создать TC: тело — `TechnicalCondition` (все поля опциональны). Ответ: `Stored<TechnicalCondition>` |
| GET | `/:id` | Получить TC. Ответ: `Stored<TechnicalCondition>` |
| PUT | `/:id` | Заменить целиком полезную нагрузку TC. Ответ: `Stored<TechnicalCondition>`. При `productTypeId` сервер записывает `lastProductTypeName` из справочника типов; без id — сохраняет переданное или прежнее имя |

Пока **не** делаем: `DELETE`, `POST …/process` (TCWorker), PATCH на отдельные слоты/правила/шаблоны — всё это сводится к одному `PUT` с полным объектом.

### `/orders` (расширение существующего)

| Метод | Путь | Действие |
|-------|------|---------|
| POST | `/:id/analyse-designation` | Запустить DesignationWorker для заказа |
| PATCH | `/:id/designation` | Записать human-правку `designation.human` |

---

## Воркеры

### TCWorker (`back/src/workers/tc-processing.worker.ts`)

**Что делает:**
Разбивает уже извлечённый текст ТУ на структурированные правила.

**Зависимости:**
- `technicalConditionsService` — читает TC, пишет rules в apply()
- `filesContentService` — читает FileContent по fileContentId
- Yandex LLM API (async, как в OrderDetailsWorker)

**Жизненный цикл:**

```
mount()
  → создаёт запись в workers.json

run()
  → читает FileContent[].content (текст страниц)
  → склеивает в один текст
  → формирует промпт (см. ниже)
  → отправляет в Yandex LLM async
  → сохраняет cloudOperationId
  → polling до завершения (как LlmVisionWorker)
  → сохраняет operationResult (JSON строка)

apply()
  → парсит operationResult → TechnicalConditionRule[]
  → генерирует id для каждого правила (nanoid)
  → записывает в TC.rules через technicalConditionsService
```

**Промпт TCWorker:**

```
Ты обрабатываешь текст Технического Условия (ТУ).
Разбей документ на смысловые правила/разделы.
Для каждого раздела выдели: заголовок (если есть) и содержание.
Таблицы сохраняй в формате markdown-таблиц.
Нумерацию разделов из ТУ сохраняй в заголовке.

Верни JSON массив:
[
  { "index": 0, "title": "...", "content": "..." },
  ...
]

Текст ТУ:
{fileContentText}
```

---

### DesignationWorker (`back/src/workers/designation.worker.ts`)

**Что делает:**
По правилам TC и требованиям заявки определяет значения каждого параметра условного обозначения.

**Зависимости:**
- `ordersService` — читает Order.details.requirements, пишет designation.ai в apply()
- `technicalConditionsService` — читает TC, DesignationSlot[], TechnicalConditionRule[]
- Yandex LLM API (async)

**Жизненный цикл:**

```
mount()
  → создаёт запись в workers.json

run()
  → читает Order.details.requirements[]
  → читает TC.designationSlots + TC.rules
  → для каждого слота собирает текст правил:
      slot.ruleIds → TC.rules[id].content → join
  → формирует промпт (см. ниже)
  → отправляет в Yandex LLM async
  → сохраняет cloudOperationId
  → polling до завершения
  → сохраняет operationResult

apply()
  → парсит operationResult → DesignationValue[]
  → пишет в Order.details.designation.ai
  → пишет tcId в Designation
```

**Промпт DesignationWorker:**

```
Определи значения параметров условного обозначения продукции.
Для каждого параметра применяй правила из ТУ и данные из заявки клиента.
Верни значение строго по правилам ТУ.

Верни JSON массив:
[
  {
    "slotIndex": 0,
    "value": "...",
    "confidence": 0.95,
    "reasoning": "..."
  },
  ...
]

Параметры для заполнения:
{для каждого слота:}
  [{index}] {name}
  Правила из ТУ:
  ---
  {content правил из ruleIds}
  ---

Требования из заявки клиента:
{requirements[].parameterName}: {requirements[].requiredValue}
```

---

## Вспомогательная функция `formatDesignation`

Чистая функция, не вызывает LLM. Расположение: `types/src/designation.ts` или `back/src/lib/designation/`.

```typescript
function formatDesignation(
    designation: Designation,
    template: DisplayTemplate,
    slots: DesignationSlot[]
): string {
    // 1. Отфильтровать values по template.includedSlots
    // 2. Отсортировать по slotIndex
    // 3. Соединить через template.separator
    // Пример результата: "НЭМС-700-1-У-КС-1-1-1"
}
```

---

## Матчинг ProductType из заявки

Выполняется синхронно в `OrderDetailsWorker.apply()` после определения `productCategory`.

```
1. Получить все ProductType из productTypesService
2. Для каждого: проверить совпадение productCategory с name или synonyms[]
   (case-insensitive, нормализация пробелов)
3. Если найден → записать productTypeId в Order.details
4. Если не найден → productTypeId остаётся undefined, UI показывает выбор вручную
```

Матчинг — простой строковый поиск, не LLM. Synonyms достаточно для покрытия вариантов из заявки.

---

## Кодогенерация

После добавления роутеров запустить:
```
npm run generate:all
```
Это обновит клиентский SDK во фронте (`front/src/lib/generated/`).

---

← [01-types.md](./01-types.md) | → [03-ui.md](./03-ui.md)
