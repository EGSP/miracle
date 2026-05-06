# План: Visual-экстрактор и флоу запуска OCR

## Контекст

Существующий паттерн экстракторов: `async function*` (AsyncGenerator), который yield'ит промежуточные состояния `Omit<FileContent, 'id'>`. `filesContentService.extract()` итерирует генератор и сохраняет каждый yield в БД.

Visual-экстрактор **отличается**: он не ждёт результата — он запускает фоновый воркер и возвращает управление. Поэтому шаблон генератора не подходит.

---

## Проблема с generator-паттерном для VISUAL

В существующем цикле:
```typescript
for await (const content of extractor(file, pathToFile)) {
  if (!createdContent)
    createdContent = await filesContentService.create(content); // ← здесь создаётся ID
}
```

Экстрактор не знает своего `fileContentId` — он рождается снаружи.  
Но воркеру нужен `fileContentId`, чтобы потом обновить запись.  
Замкнутый круг.

**Решение:** `extractVisualContent` — обычная `async function` (не генератор), которая создаёт FileContent сама. `filesContentService.extract()` имеет специальную ветку для `VISUAL`.

---

## Флоу запуска

### Схема

```
filesContentService.extract(fileId)
  └── case FileDomain.VISUAL → extractVisualContent(file, pathToFile)

extractVisualContent(file, pathToFile)
  1. filesContentService.create({ fileId, meta: { type: OCR, status: STARTED } })
     → fileContent.id
  2. new YandexOcrWorker(fileContent.id, file.id, mimeType)
  3. workerPool.launch(worker)
  4. return fileContent   ← управление возвращается немедленно

YandexOcrWorker.run()   [фоновый, не блокирует]
  1. operationsService.create({ meta: { type: 'yandex-ocr', fileId, fileContentId, mimeType }, done: false })
     → operationRecord.id
  2. asyncClient.recognize(request) → cloudOp
  3. operationsService.update(operationRecord.id, { cloudOperationId: cloudOp.id })
  4. workersService.create({ status: 'active', meta: { type: 'yandex-ocr-poller', operationId, fileContentId } })
     → workerRecord.id (= this.workerRecord)
  5. opClient.get({ operationId: cloudOp.id })
     → если done сразу (редко) — переходим к 7
  6. waitForOperation(op, session)   ← SDK-метод, не кастомный polling
  7. asyncClient.getRecognition({ operationId: cloudOp.id }) — стриминг страниц
  8. filesContentService.update({
       id: fileContentId,
       content: [{ page, text }, ...],
       meta: { type: OCR, status: COMPLETED }
     })
  9. operationsService.update(operationRecord.id, { done: true, result: joinedText })
  10. workersService.update(workerRecord.id, { status: 'stopped' })

  При ошибке на любом шаге:
  → filesContentService.update({ meta: { status: FAILED, failedMessage: err } })
  → operationsService.update({ done: true, errorMessage: err })
  → workersService.update({ status: 'failed' })
```

---

## Изменения в `filesContentService.extract()`

```typescript
case FileDomain.VISUAL:
  return extractVisualContent(file, pathToFile);
```

Возвращаемый тип метода `extract` меняется с `Promise<void>` на `Promise<Stored<FileContent> | undefined>`.

---

## Сигнатура экстрактора

**Файл:** `back/src/lib/extraction/visual.ts`

```typescript
export async function extractVisualContent(
  dbFile: Stored<FileModel>,
  pathToFile: string
): Promise<Stored<FileContent>>
```

Внутри:
1. Определяет `mimeType` по `dbFile.extension` (`jpg/jpeg/png` → `image/jpeg` и т.д., `pdf` → `application/pdf`)
2. Создаёт начальное состояние FileContent через `filesContentService.create()`
3. Создаёт и запускает `YandexOcrWorker`
4. Возвращает созданный `fileContent`

---

## Экспорт

**`back/src/lib/extraction/index.ts`** — добавить:
```typescript
export * from './visual.js';
```

---

## Как сервис видит статус операции (для фронта)

После вызова `extract` сервис может:
- Читать `FileContent.meta.extractionStatus` — `STARTED` / `COMPLETED` / `FAILED`
- Дополнительно: `workerPool.find('yandex-ocr-poller', w => w.fileContentId === id)` — есть ли живой воркер

Фронт опрашивает `/file-content/:fileId` — и видит обновления по мере завершения.

---

## Файлы к созданию/изменению

| Файл | Действие |
|------|---------|
| `back/src/lib/extraction/visual.ts` | создать |
| `back/src/lib/extraction/index.ts` | добавить экспорт |
| `back/src/databases/file-content.db.ts` | обновить `extract()` — ветка VISUAL |
| `back/src/workers/yandex-ocr-worker.ts` | создать (см. план task-2) |
| `back/src/workers/worker-pool.ts` | создать (см. план task-2) |
| `back/src/databases/operations.db.ts` | создать (см. план task-2) |
| `back/src/databases/workers.db.ts` | создать (см. план task-2) |
| Точка старта сервера | `await workerPool.restore()` |

---

## Решённые вопросы

### 1. getMimeType — предусловие рефактора (выполнить до этой задачи)

`getMimeType(extension)` берётся из общего модуля `types/src/file-types.ts`.  
Подробности — в плане `task-0-file-types-refactor.md`. Этот рефактор обязателен до реализации visual-экстрактора.

### 2. Страницы при OCR

`getRecognition()` стримит `RecognizeTextResponse` — каждый элемент это одна страница с полями `page` (номер) и `textAnnotation.fullText`. Сохраняем постранично:

```typescript
const pages: Array<{ page: number; text: string }> = [];
for await (const response of resultStream) {
  if (response.textAnnotation?.fullText) {
    pages.push({ page: response.page, text: response.textAnnotation.fullText });
  }
}
// Сохраняем в FileContent.content как есть
```

`fullText` — это весь текст одной страницы. Объединять через `\n\n` для поля `result` в OperationRecord опционально.

### 3. Защита от повторного запуска OCR

В `extractVisualContent` (или в `filesContentService.extract()` до вызова экстрактора) проверять существующие записи:

```typescript
const existing = filesContentService.getContent(fileId);
const blocking = existing.find(c =>
  c.meta?.extractionStatus === ExtractionStatus.STARTED ||
  c.meta?.extractionStatus === ExtractionStatus.COMPLETED
);
if (blocking) return blocking; // уже идёт или уже сделано — не запускать повторно
```

- `STARTED` → воркер активен, повтор не нужен
- `COMPLETED` → уже есть результат
- `FAILED` → повторный запуск разрешён

Эту проверку разумно сделать общей для всех доменов в `filesContentService.extract()`, не только для VISUAL.
