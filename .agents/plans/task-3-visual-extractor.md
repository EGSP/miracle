# План: visual-экстрактор и запуск OCR-воркера

## Контекст

`VISUAL`-извлечение выполняется асинхронно: запрос запускает OCR-воркер и быстро возвращает управление.  
Результат появляется позже в `FileContent`.

Отдельной БД операций нет: состояние OCR хранится в `WorkerData` (`workers.db`).

---

## Цель

1. Добавить `extractVisualContent(...)` как обычную `async`-функцию (не generator).
2. Встроить ветку `FileDomain.VISUAL` в `filesContentService.extract()`.
3. Запускать `YandexOcrWorker` через `workerPool.launch(...)`.
4. Добавить защиту от повторного запуска извлечения.

---

## Почему не generator

Для `VISUAL` нужно сразу создать запись `FileContent`, получить `fileContentId` и передать его воркеру.  
Это проще и надёжнее сделать в обычной `async`-функции.

---

## Флоу

### 1) Вызов `filesContentService.extract(fileId)`

- Определяется домен файла через `getFileDomain(...)`.
- Для `VISUAL` вызывается `extractVisualContent(file, pathToFile)`.

### 2) `extractVisualContent(file, pathToFile)`

1. Проверяет `mimeType` через `getMimeType(extension)`.
2. Для `VISUAL` разрешает только:
   - `image/jpeg`
   - `image/png`
   - `application/pdf`
3. Создаёт стартовую запись `FileContent`:
   - `meta.extractionType = ExtractionType.OCR`
   - `meta.extractionStatus = ExtractionStatus.STARTED`
4. Создаёт `YandexOcrWorker` с `fileId`, `fileContentId`, `mimeType`.
5. Запускает воркер через `workerPool.launch(worker)`.
6. Возвращает созданный `Stored<FileContent>`.

### 3) Фоновая обработка в `YandexOcrWorker`

1. `mount()`:
   - создаёт/синхронизирует `WorkerData` в `workers.db`.
2. `run()`:
   - запускает OCR в Yandex Cloud;
   - сохраняет `cloudOperationId` в `WorkerData`;
   - ждёт завершения через `waitForOperation`;
   - читает страницы через `getRecognition`;
   - обновляет `FileContent` до `COMPLETED`;
   - сохраняет `operationDone/operationResult` и переводит воркер в `stopped`.
3. При ошибке:
   - `FileContent` переводится в `FAILED`;
   - в `WorkerData` пишется `operationErrorMessage`;
   - статус воркера становится `failed`.

---

## Изменения в `filesContentService.extract()`

Ветка:

```ts
case FileDomain.VISUAL:
  return extractVisualContent(file, pathToFile);
```

Возвращаемый тип:

```ts
Promise<Stored<FileContent> | undefined>
```

---

## Защита от повторного запуска

Перед стартом нового извлечения искать существующую запись `FileContent` для файла:

- если `extractionStatus` = `STARTED` или `COMPLETED` — вернуть её и не запускать новый OCR;
- если `FAILED` — разрешить повторный запуск.

Проверку делать в `filesContentService.extract()` как общую политику.

---

## Структура сохранения OCR-результата

`getRecognition()` возвращает поток страниц.  
Сохранять в `FileContent.content` постранично:

```ts
[{ page, text }, ...]
```

`text` брать из `textAnnotation.fullText`.

---

## Файлы

| Файл | Действие |
|------|----------|
| `back/src/lib/extraction/visual.ts` | создать visual-экстрактор |
| `back/src/lib/extraction/index.ts` | экспортировать `visual.ts` |
| `back/src/databases/file-content.db.ts` | добавить ветку VISUAL и общую защиту от повторного запуска |
| `back/src/workers/yandex-ocr-worker.ts` | использовать как фоновый OCR-исполнитель |
| `back/src/workers/worker-pool.ts` | использовать для запуска/восстановления воркеров |

---

## Предусловия

- `task-0-file-types-refactor` завершён (`getMimeType` доступен).
- `task-2-operations-workers` завершён (`workerPool`, `YandexOcrWorker`, `workers.db` готовы).
