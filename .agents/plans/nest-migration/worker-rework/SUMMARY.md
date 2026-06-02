# Реворк: приложения/позиции заказа + движок джобов — саммари

> Итог рабочей сессии. Лекция-основание — `index.html` в этой папке. Концепт-паттерн — `../job.md`.
> **Следующий шаг:** перенос доменных джобов со старого API на новый фреймворк (см. «Что осталось»).

## 1. OrderApplication — приложения к заказу

Заказ ссылается не на один файл, а на множество **приложений** (источников). Все равноправны.

- Тип `OrderApplication = { orderId, authorId, data: ApplicationData }`, где
  `ApplicationData = { type:'file', fileId } | { type:'text', text }` (дискриминированный юнион в jsonb).
  Файлы: `types/src/order-application.ts`.
- Плоская связь: `OrderApplication.orderId` (string + `@@index`), без Prisma-relation — как везде в схеме.
- Загрузка файла **и** привязка одним запросом (закрывает «окно бесхозного файла»):
  логика записи на диск вынесена из контроллера в `FilesService.writeUploadToDisk`/`saveUpload`;
  `OrderApplicationsService.createFile` создаёт `File` + `OrderApplication` в одной транзакции.
- Эндпоинты (`orders.controller.ts`): `GET :id/applications`, `POST :id/applications/file` (multipart),
  `POST :id/applications/text` (json), `DELETE :id/applications/:appId` (файловое приложение → soft-delete
  и самого `File`; файл на диске остаётся).

## 2. OrderPosition — позиции внутри приложения

Одно приложение → несколько **позиций**. Обработка содержимого переехала на уровень позиции.

- Тип `OrderPosition = { applicationId, productTypeId?, productTypeName?, requirements?, designation? }`
  (`types/src/order-position.ts`), `PositionRequirement = { parameterName, requiredValue }`.
  Своя таблица `order_positions`, плоская связь `applicationId` + `@@index`.
- **Удалены** `OrderDetails`, тип `Dual` (`ai/human`), `OrderRequirement`, `getOrderProductTypeId`.
  Поля `index`/`used`/`clientCompanyName` убраны. `Order` теперь контейнер `{ authorId }`.
- В `worker.ts` поле `orderDetails` временно `unknown` (TODO до рефактора воркеров).

## 3. Миграции

Проект переведён с `prisma db push` на историю миграций через **baseline**:
`0_init` (снимок текущей БД, помечен applied) + последующие. **Дальше схему меняем только
`prisma migrate`, не `db push`** — иначе drift. Применённые миграции: `add_order_applications`,
`add_order_positions`, `drop_order_file_and_details`, `flatten_job_runs`.

## 4. Движок джобов — новый механизм

Ушли от декларативного дерева (leaf/sequence/runner/cursor/steps) к плоской императивной durable-модели.

- **Структура:** чистый фреймворк в `back-nest/src/jobs/framework/` (`job.ts`, `context.ts`, `store.ts`,
  `registry.ts`, `runtime.ts`), Nest-обёртки — в `jobs/`. Старые файлы движка удалены.
- **Job** = `{ id, run }` через `defineJob` (никаких `leaf/andThen/named/combinators`).
  Оркестрация — внутри тела через сервис `Jobs`.
- **Сервисы-теги:** `Memo` (get/set — чекпоинт внутри джоба), `Progress` (set(pct,label?)),
  `Jobs` (`run(job, key, input)` — запуск под-джоба).
- **Плоский `JobRun`:** `parentId` (id непосредственного родителя; null у корня), `key` (идемпотентность
  в пределах родителя; null у корня), `@@unique([parentId, key])`. Без `cursor`/`steps`.
- **`Jobs.run` по статусу найденного ребёнка:** `succeeded` → вернуть `output`; `failed`/`cancelled` →
  пробросить ошибку (перезапуск — только новым прогоном); `running`/`queued` → переисполнить.
  `parentId` подставляет рантайм (внук цепляется к ребёнку, не к корню).
- **Durability = replay:** при рестарте корень проигрывается заново, завершённые дети отдают кэш.
  Тело родителя обязано быть чистой оркестрацией (побочные эффекты — только в детях или под `memo`).
- **Порт `JobStore`** отделяет рантайм от Prisma (реализация — `prisma-job-store.ts`). Персист
  поштучно по строке (нет усиления записи).
- **Единый `JobsService`** (слиты прежние JobRuntimeService + JobRunsService): `start`, рекурсивный
  `cancel`, recovery на bootstrap, `list/getPromptPreview/delete`. **`applyById` удалён** (и `/apply`).
- Публичная функция исполнения — `execute(store, job, node)` (без древовидной терминологии в имени).
- Прогресс пишут сами джобы (`Progress.set`); сбор — рекурсивным обходом по `parentId` (итог
  приблизительный, число детей заранее неизвестно).

## Что осталось (следующий шаг — реворк доменных джобов)

Шесть файлов используют **старый** API/пути и красные by design:

| Домен | Файлы | Нужно |
|---|---|---|
| orders | `order-jobs.ts`, `order-jobs.service.ts` | новый API **+** переезд на `OrderPosition`/`applicationId` (старая завязка на `order.details`/`fileId`/`OrdersService.update`) |
| technical-conditions | `tc-jobs.ts`, `tc-jobs.service.ts` | новый API (`defineJob` + `Jobs.run`, импорт из `jobs/framework`) |
| files-content | `scan-jobs.ts`, `scan-jobs.service.ts` | новый API |

`common/cloud-job.ts` (`submitOnce`/`pollUntilDone`) уже на новом `Memo` и зелёный — подойдёт как есть.
Эндпоинты анализа в `orders.controller.ts` временно отвечают `501` до переноса джобов.
Сервер пока не стартует (эти 6 файлов) — ожидаемо для поэтапной миграции.
