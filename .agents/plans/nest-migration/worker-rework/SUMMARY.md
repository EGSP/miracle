# Реворк: приложения/позиции заказа + движок джобов — саммари

> Итог рабочей сессии. Лекция-основание — `index.html` в этой папке. Концепт-паттерн — `../job.md`.
> **Следующий шаг:** подключить новые джобы к контроллерам (эндпоинты анализа всё ещё 501) — см. «Что осталось».

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

## 5. Реворк доменных джобов — выполнено

Каждый корневой джоб — **отдельный инъецируемый класс в своём файле** под
`back-nest/src/jobs/implementations/`, сгруппированы по категориям подпапками:

```
implementations/
  scan/   scan.shared.ts · ocr.job.ts · llm-vision.job.ts · llm-vision-tc.job.ts
  order/  order-analyse.job.ts · designation-analyse.job.ts
  tc-extract.job.ts        (одиночный — без подпапки)
```

- **Класс-джоб** = `@Injectable() @JobImpl()` + `implements Job<I,O>` (поля `id`, `run`). Доменные
  сервисы инъецируются в конструктор обычным DI; дети (`llm`/`recognize`, `apply`) строятся в
  конструкторе через `defineJob`, замыкая инъецированные сервисы. `run` — чистая оркестрация
  детей через `Jobs.run`. Общая «начинка» scan-джобов — в `scan/scan.shared.ts` (3 класса её не дублируют).
- **Авторегистрация вместо регистраторов.** `@JobImpl()` (`framework/job-impl.decorator.ts`) ставит
  метку; `JobsService` на `onApplicationBootstrap` находит все провайдеры с меткой через
  `DiscoveryService` и регистрирует в реестре, затем — recovery. Прежние доменные регистраторы
  `OrderJobs`/`TcJobs`/`ScanJobs` **удалены**.
- **Единый модуль** `jobs/job-implementations.module.ts`: провайдит все джоб-классы, импортирует
  доменные модули (Files/FilesContent/ProductTypes/TechnicalConditions/Orders). Подключён в `AppModule`.
  `JobsModule` импортирует `DiscoveryModule`.
- **Запуск по id.** `JobsService.start(id | job, input)` (перегрузка по строке резолвит через реестр).
  Потребители из других модулей зовут по id, не инъецируя класс джоба (нет цикла):
  `ExtractionService` → `start('ocr'|'llm-vision'|'llm-vision-tc', …)`,
  `TechnicalConditionsController` → `start('tc-extract', {tcId})`.
- **Паттерн дюрабилити (без изменений):** `llm`/`recognize` мемоизирует только `opId`; его **output**
  (результат) живёт в `JobRun` ребёнка и повторно не хранится. `apply` — побочный эффект (для
  `order-analyse` это `create`, защищён кэшем ребёнка от дубля при replay).
- **order** переехал на приложения/позиции: `order-analyse(applicationId)` → `OrderPosition`;
  `designation-analyse(positionId, tcId)` → `OrderPosition.designation`. Убраны `OrderDetails`/Dual/
  `clientCompanyName`/`OrdersService.update`. Создан `OrderPositionsService` (экспорт `OrdersModule`).

Состояние: `npm install` + `prisma generate` выполнены, `tsc` по `back-nest` — **0 ошибок**.
Приложение не загружалось вживую (нет `DATABASE_URL` в `.env` и поднятой БД) — проверка статическая.

## Что осталось (следующий шаг)

Подключить новые джобы к контроллерам: эндпоинты анализа в `orders.controller.ts`
(`analyse-details`, `analyse-designation`) пока отвечают `501`. Нужно запускать
`order-analyse`/`designation-analyse` через `JobsService.start('order-analyse', {applicationId})` /
`start('designation-analyse', {positionId, tcId})` (вероятно — новый контроллер уровня
приложения/позиции, т.к. вход теперь `applicationId`/`positionId`, а не `orderId`).
