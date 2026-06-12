# Фаза 4 — автоподготовка на upload + backpressure

## Статус

`выполнено`

## Что сделано

1. **Автоподготовка на upload:** `FilesService.saveUpload` после успешного `create` вызывает `scheduleAutoPrepare` → fire-and-forget `DocumentPrepareService.enqueuePrepare(fileId)`.
2. **Идемпотентность:** используется существующий `enqueuePrepare` (key `['prepare-document', fileId]`, логика re-prepare из Фазы 2).
3. **Неподдерживаемые форматы:** `routePreparedEngine` — enqueue не вызывается, upload без изменений.
4. **Ошибки enqueue:** логируются через `AppLogger`, клиент получает созданный `File`.
5. **Batch backpressure:** `DocumentPrepareService.enqueuePrepareBatch(fileIds)` — `Swarm.run` с `failureMode: 'bestEffort'`, `concurrency: 4` (локальный лимит одного вызова).
6. **Circular DI:** `forwardRef` в `FilesModule` ↔ `DocumentPrepareModule`.
7. **Документация:** `document-prepare/README.md`, `dp.report.md`.

## Изменённые файлы

- `back-nest/src/files/files.service.ts`
- `back-nest/src/files/files.module.ts`
- `back-nest/src/document-prepare/document-prepare.service.ts`
- `back-nest/src/document-prepare/document-prepare.module.ts`
- `back-nest/src/document-prepare/README.md`
- `.agents/plans/dp.report.md`

## Проверки

- `npx tsc --noEmit` в `back-nest/` — OK.

## Допущения

- Batch-upload HTTP-эндпоинта нет; `enqueuePrepareBatch` — готовность для будущих сценариев (вызов из кода, не из контроллера).
- Concurrency batch enqueue — константа `4`, не отдельная env-переменная (отличие от `DPS_MAX_CONCURRENCY` для kreuzberg HTTP).
- Хук только в `saveUpload`, не в `writeUploadToDisk` / `OrderApplication` (orders вне scope по ТЗ).
- `failureMode: 'bestEffort'` для batch — все fileId обрабатываются, ошибки в `summary.failures`, метод не бросает.

## Блокеры

Нет.
