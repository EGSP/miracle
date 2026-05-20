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

Пока **не** делаем: `DELETE`, PATCH на отдельные слоты/правила/шаблоны — всё это сводится к одному `PUT` с полным объектом. Извлечение текста PDF ТУ — через общий `filesContentService.extract(fileId)` (см. ниже).

### `/orders` (расширение существующего)

| Метод | Путь | Действие |
|-------|------|---------|
| POST | `/:id/analyse-designation` | Запустить DesignationWorker для заказа |
| PATCH | `/:id/designation` | Записать human-правку `designation.human` |

---

## Маршрутизация извлечения (`filesContentService.extract`)

Точка входа для «читки» файла — существующий `filesContentService.extract(fileId)` (`back/src/databases/file-content.db.ts`). При запуске извлечения сервис **обязан учитывать настройки файла** (`FileModel.settings`).

Для домена `VISUAL` (pdf, jpg, png) порядок выбора воркера:

```
filesContentService.extract(fileId)
  → читает file.settings
  → if (file.settings?.isTechnicalCondition)
        extractVisualContentWithTcLLM(file)   // LlmVisionTcWorker
     else if (file.settings?.complexLayout)
        extractVisualContentWithLLM(file)     // LlmVisionWorker
     else
        extractVisualContentWithOCR(file)     // YandexOcrWorker
```

**Важно:**
- `isTechnicalCondition` имеет **приоритет** над `complexLayout`: PDF ТУ всегда идёт в `LlmVisionTcWorker`, даже если включены обе настройки.
- Настройка `isTechnicalCondition` уже есть в `FileModel.settings`; при загрузке/привязке PDF к TC UI выставляет её через `PATCH /files/:id` (или при upload с `settings`).
- Отдельный запуск воркера из роутера TC не нужен — достаточно `POST /files-content/:fileId/extract` (или автозапуск после upload, как для остальных файлов).
- Хелпер `extractVisualContentWithTcLLM` — по аналогии с `extractVisualContentWithLLM` в `back/src/lib/extraction/visual.ts`: создаёт `FileContent` со статусом `STARTED`, запускает `LlmVisionTcWorker` через `workerPool.launch`.

---

## Воркеры

### LlmVisionTcWorker (`back/src/workers/scan/llm-vision-tc-worker.ts`)

**Что делает:**
Извлекает из PDF Технического Условия структурированный и осмысленный текст — разделы, таблицы (markdown), нумерацию, коды параметров. Воркер **только вычитывает** документ с учётом специфики ТУ; результат — заполненный `FileContent.content`. Разбиение на `TechnicalConditionRule[]` — отдельный шаг (UI / последующая обработка), не задача этого воркера.

**Вход:** всегда PDF (`fileId` TC-файла). Предварительный OCR или `llm-vision-worker` не требуются.

**Зависимости:**
- `filesService`, `getFilePath` — читает PDF с диска
- `filesContentService` — создаёт запись до запуска, пишет `content` в `apply()`
- `pdfToImages` — рендер страниц PDF в изображения
- `yandexLlm.callVisionCompletion` — синхронный Responses API с передачей изображений (как `LlmVisionWorker`, **не** async polling)

**Запуск** — через `filesContentService.extract(fileId)` при `file.settings.isTechnicalCondition === true` (см. «Маршрутизация извлечения» выше):

```
extractVisualContentWithTcLLM(file):
  1. filesContentService.create({ fileId, meta: { extractionType: LLM, extractionStatus: STARTED } })
  2. workerPool.launch(new LlmVisionTcWorker({ data: null, fileId, fileContentId }))
```

**Жизненный цикл:**

```
mount()
  → создаёт запись в workers.json (type: llm-vision-tc-worker)

run()
  → читает PDF по fileId
  → pdfToImages(buffer, { scale: 2.5 }) → dataUrl[] для каждой страницы
  → callVisionCompletion({
        instructions: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [ ...input_image, input_text ] }]
    })
  → сохраняет operationResult (markdown-текст ответа LLM)
  → status: success
  (при ошибке — meta.extractionStatus: FAILED на FileContent, status: failed)

apply()
  → записывает operationResult в FileContent.content: [{ text }]
  → meta: { extractionType: LLM, extractionStatus: COMPLETED }
```

**Промпт LlmVisionTcWorker** (`SYSTEM_PROMPT`):

```
Ты — ассистент для извлечения содержимого из документов Технических Условий (ТУ).
Тебе передаются страницы PDF в виде изображений.

Извлеки весь текст документа с сохранением структуры:
- Заголовки разделов и подразделов с исходной нумерацией из ТУ
- Обычный текст — дословно, в порядке следования в документе
- Таблицы — в формате markdown-таблиц с сохранением всех строк, столбцов и заголовков
- Списки и перечисления — с сохранением маркировки и уровней вложенности
- Формулы, обозначения, единицы измерения — без интерпретации и перефразирования

Особое внимание:
- Таблицы технических условий (параметры, допустимые значения, коды обозначений) — извлекай полностью
- Сохраняй связь между номером пункта ТУ и его содержанием
- Не пропускай текст мелким шрифтом, сноски, примечания к таблицам

Не добавляй комментариев, пояснений и интерпретаций от себя.
Верни единый связный текст документа в формате markdown.
```

User-сообщение в `callVisionCompletion`: `Извлеки содержимое документа Технических Условий.`

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
