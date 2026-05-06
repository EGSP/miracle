# Visual Domain — порядок исполнения задач

## Задачи

| # | Файл плана | Суть |
|---|-----------|------|
| 0 | `task-0-file-types-refactor.md` | Рефактор: единый источник правды для расширений и mime-типов |
| 2 | `task-2-operations-workers.md` | БД операций, БД воркеров, классы воркеров, WorkerPool |
| 3 | `task-3-visual-extractor.md` | Visual-экстрактор, флоу запуска OCR, защита от повторного запуска |

---

## Порядок

```
Задача 0 → Задача 2 → Задача 3
```

Задачи 2 и 3 нельзя поменять местами: задача 3 импортирует воркер из задачи 2.

---

## Задача 0 — рефактор `file-types`

**Должно быть готово до задачи 3.**  
Задача 2 не зависит от рефактора и может быть сделана параллельно с задачей 0 — если разные исполнители.

### Что учесть

- `getFileDomain()` уже есть в `types/src/file.ts` и используется в `back/src/databases/file-content.db.ts`. После рефактора сигнатура функции не меняется — только внутренняя реализация.
- `file.router.ts` содержит `CONTENT_TYPE_BY_EXTENSION` с лишними расширениями (`webp`, `gif`) — при переходе на общий модуль их убрать (они не поддерживаются ни в одном FileDomain).
- После рефактора проверить компиляцию обоих пакетов: `types/` и `back/`.

---

## Задача 2 — операции и воркеры

**Зависимостей нет, можно делать параллельно с задачей 0.**

### Что учесть перед исполнением

- Создать `types/src/workers.ts` с типами `OperationRecord`, `WorkerRecord`, `OperationMeta`, `WorkerMeta` и конкретными мета-типами (`YandexOcrOperationMeta`, `YandexOcrPollerMeta`). Добавить экспорт в `types/src/index.ts`.
- `JsonCollection<OperationRecord>` и `JsonCollection<WorkerRecord>` — одна коллекция с discriminated union. Сужение типов через `meta.type`.
- `BaseWorker.run()` — полный жизненный цикл воркера. Воркер сам создаёт свои записи в БД. WorkerPool не знает о деталях.
- `WorkerPool` — синглтон. Инициализировать в точке старта сервера (рядом с `app.listen()`): `await workerPool.restore()`.
- При `restore()` пропускать воркеры, у которых OperationRecord уже `done: true` — значит задача завершилась до рестарта, но статус воркера не успел обновиться. Такие записи пометить `stopped`.

---

## Задача 3 — visual-экстрактор

**Зависит от задач 0 и 2.**

### Что учесть перед исполнением

- Убедиться, что `getMimeType(extension)` из задачи 0 доступна и покрывает все VISUAL расширения: `jpg`, `jpeg`, `png`, `pdf`.
- `YandexOcrWorker` из задачи 2 готов и экспортирован.
- `workerPool` (синглтон из задачи 2) инициализирован при старте сервера.
- Защита от повторного запуска: в `filesContentService.extract()` добавить общую проверку существующего FileContent со статусом `STARTED` или `COMPLETED`. Возвращать существующую запись, не запускать новый экстрактор.
- `extractVisualContent` — не генератор. Специальная ветка в `filesContentService.extract()`:
  ```typescript
  case FileDomain.VISUAL:
    return extractVisualContent(file, pathToFile);
  ```
  Изменить возвращаемый тип `extract()` на `Promise<Stored<FileContent> | undefined>`.
- `getRecognition()` возвращает `RecognizeTextResponse` с полями `page` и `textAnnotation.fullText`. Сохранять постранично в `FileContent.content: [{ page, text }]`.
- Yandex OCR (async) поддерживает только: `image/jpeg`, `image/png`, `application/pdf`. Если `getMimeType` вернул что-то другое для VISUAL — выбросить ошибку с понятным сообщением.
