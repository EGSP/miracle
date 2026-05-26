# План: инфраструктура воркеров и персистентное восстановление

## Контекст

Нужна система фоновых задач, которая:
- не теряет состояние при рестарте сервера;
- восстанавливает незавершённые задачи;
- хранит технические данные выполнения прямо в записи воркера.

Отдельная сущность `Operation` не используется.  
Состояние облачной OCR-операции хранится в `WorkerData`.

---

## Цель

Реализовать:
1. Типы воркеров в `@miracle/types`.
2. БД воркеров (`workers.db.ts`) c CRUD + `query(predicate)`.
3. Базовый класс воркера с фазами `mount()` и `run()`.
4. `YandexOcrWorker` как первый конкретный воркер.
5. `WorkerPool` (singleton) с `restore()` при старте сервера.

---

## Типы (`types/src/worker.ts`)

Файл должен содержать типы с нуля:

```ts
type WorkerType = 'yandex-ocr-worker';
type WorkerStatus = 'active' | 'stopped' | 'failed';

type BaseWorkerData = {
  type: WorkerType;
  status: WorkerStatus;
};

type YandexOcrWorkerData = BaseWorkerData & {
  type: 'yandex-ocr-worker';
  fileId: string;
  fileContentId: string;
  mimeType: string;
  cloudOperationId?: string;
  operationDone: boolean;
  operationErrorMessage?: string;
  operationResult?: string;
};

type WorkerData = YandexOcrWorkerData;
```

Экспортировать эти типы через `types/src/index.ts`.

---

## База воркеров (`back/src/databases/workers.db.ts`)

Одна коллекция:

```ts
JsonCollection<WorkerData>('workers')
```

Сервис:
- `create(data)`
- `get(id)`
- `update(id, patch)`
- `query(predicate)`

`query(predicate)` — единственный способ выборки через `filter`.

---

## Базовый воркер (`back/src/workers/base-worker.ts`)

```ts
abstract class BaseWorker {
  abstract readonly type: WorkerType;

  // Подготовка состояния перед запуском (создание/синхронизация DB-записей)
  abstract mount(): Promise<void>;

  // Основной рабочий цикл
  abstract run(): Promise<void>;

  protected shouldStop = false;
  stop(): void;
}
```

`mount()` всегда вызывается пулом перед `run()`.

---

## Реализация `YandexOcrWorker`

**Файл:** `back/src/workers/yandex-ocr-worker.ts`

### Ответственность

`YandexOcrWorker` полностью владеет данными OCR-операции:
- запуск cloud OCR;
- ожидание завершения;
- чтение результата;
- фиксация статуса и результата в `WorkerData`.

### Источник состояния

Только `workers.db`:
- `cloudOperationId`
- `operationDone`
- `operationErrorMessage`
- `operationResult`

### Фаза `mount()`

1. Если записи воркера ещё нет — создать `WorkerData` со статусом `active` и `operationDone: false`.
2. Если запись уже есть — перевести в `status: 'active'` и синхронизировать текущие поля (например `cloudOperationId`).

### Фаза `run()`

1. Проверить, что `mount()` уже отработал (есть `workerId`).
2. Если `cloudOperationId` отсутствует:
   - запустить `recognize()`;
   - сохранить `cloudOperationId` в `workers.db`.
3. Дождаться завершения через `waitForOperation(...)`.
4. Получить страницы через `getRecognition(...)`.
5. Обновить `FileContent`:
   - `content: [{ page, text }]`
   - `meta.extractionStatus = COMPLETED`
6. Обновить `WorkerData`:
   - `operationDone = true`
   - `operationResult = joinedText`
   - `status = 'stopped'`

При ошибке:
- `FileContent.meta.extractionStatus = FAILED`
- `FileContent.meta.extractionFailedMessage = error`
- `WorkerData.operationDone = true`
- `WorkerData.operationErrorMessage = error`
- `WorkerData.status = 'failed'`

---

## WorkerPool (`back/src/workers/worker-pool.ts`)

### Интерфейс

- `restore(): Promise<void>`
- `launch(worker: BaseWorker): void`
- `find(type, predicate?): T[]`

### Поведение

- `launch()`:
  1. добавляет воркер в `active`;
  2. вызывает `await worker.mount()`;
  3. вызывает `await worker.run()`;
  4. удаляет воркер из `active` в `finally`.

- `restore()`:
  - читает `workersService.query(w => w.status === 'active')`;
  - по `type` поднимает конкретный класс воркера;
  - запускает через `launch()`.

---

## Инициализация при старте сервера

До `app.listen()`:

```ts
await workerPool.restore();
```

Если восстановление не удалось — логировать ошибку и завершать процесс.

---

## Файлы

```
types/src/
└── worker.ts

back/src/
├── databases/
│   └── workers.db.ts
├── workers/
│   ├── base-worker.ts
│   ├── worker-pool.ts
│   └── yandex-ocr-worker.ts
└── lib/yandex/
    └── yandex.ts
```

---

## Технические договорённости

- Логи и комментарии — на русском.
- Для выборок в БД использовать `query(predicate)`.
- Данные OCR-операции не дублировать в отдельных коллекциях.
