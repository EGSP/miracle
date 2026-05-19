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
Файл: back/src/databases/technical-conditions.service.ts
БД:   back/data/technical-conditions.json

Методы:
  create(data)                         → Stored<TechnicalCondition>
  getAll()                             → Stored<TechnicalCondition>[]
  getById(id)                          → Stored<TechnicalCondition> | undefined
  getByProductTypeId(productTypeId)    → Stored<TechnicalCondition>[]
  update(id, patch)                    → Stored<TechnicalCondition>
  delete(id)                           → void

  // Работа с вложенными объектами:
  addRule(tcId, rule)                  → Stored<TechnicalCondition>
  updateRule(tcId, ruleId, patch)      → Stored<TechnicalCondition>
  deleteRule(tcId, ruleId)             → Stored<TechnicalCondition>

  setSlots(tcId, slots)                → Stored<TechnicalCondition>
  updateSlot(tcId, slotIndex, patch)   → Stored<TechnicalCondition>

  addTemplate(tcId, template)          → Stored<TechnicalCondition>
  updateTemplate(tcId, tplId, patch)   → Stored<TechnicalCondition>
  deleteTemplate(tcId, tplId)          → Stored<TechnicalCondition>
```

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
| GET | `/` | Список (query: `?productTypeId=`) |
| POST | `/` | Создать TC (fileId, version, productTypeId) |
| GET | `/:id` | Получить TC со всеми вложенными данными |
| PATCH | `/:id` | Обновить метаданные TC |
| POST | `/:id/process` | Запустить TCWorker (парсинг правил из FileContent) |
| PUT | `/:id/slots` | Сохранить DesignationSlot[] целиком |
| PATCH | `/:id/slots/:index` | Обновить один слот (name, ruleIds) |
| PATCH | `/:id/rules/:ruleId` | Обновить правило (ручная правка content/title) |
| POST | `/:id/templates` | Добавить DisplayTemplate |
| PATCH | `/:id/templates/:tplId` | Обновить шаблон |
| DELETE | `/:id/templates/:tplId` | Удалить шаблон |

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
