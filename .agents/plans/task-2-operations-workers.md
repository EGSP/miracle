# План: БД операций и система воркеров

## Контекст

Нужна инфраструктура для фоновых задач с персистентностью — чтобы при рестарте сервера незавершённые задачи восстанавливались. Первый конкретный воркер — ожидание Yandex OCR.

Используемая БД: LowDB через `JsonCollection<TItem>` из `back/src/databases/db.ts`.

---

## Часть 1: БД операций (`operations.db.ts`)

### Концепция

Операция — запись о взаимодействии с внешним сервисом (Яндекс, другие). Хранит:
- Связь с доменными объектами (через `meta`)
- ID внешней облачной операции (для восстановления)
- Статус и результат

### Полиморфизм через discriminated union

`JsonCollection<TItem>` не поддерживает полиморфизм нативно — `TItem` фиксирован.  
Решение: одна коллекция с дискриминированным объединением в поле `meta`.

```typescript
// Мета для конкретного типа операции
type YandexOcrOperationMeta = {
  type: 'yandex-ocr';
  fileId: string;
  fileContentId: string;
  mimeType: string;
};

// Объединение расширяется по мере добавления новых типов операций
type OperationMeta = YandexOcrOperationMeta; // | SomeFutureOperationMeta

// Запись в БД
type OperationRecord = {
  cloudOperationId?: string;  // ID операции в Яндексе (undefined до момента запуска)
  done: boolean;
  errorMessage?: string;      // Operation.error.message, если failed
  result?: string;            // декодированный текст (только для успешных)
  meta: OperationMeta;        // дискриминант — meta.type
};
```

**Сужение типа при чтении:**
```typescript
const ops = operationsDb.list();
const ocrOps = ops.filter(op => op.meta.type === 'yandex-ocr');
// TypeScript сужает: ocrOps[n].meta — это YandexOcrOperationMeta
```

**Альтернатива** (отдельные коллекции): если типы операций сильно расходятся по полям или нужен отдельный индексированный поиск — завести `JsonCollection` на каждый тип. Но для старта одна коллекция с union проще.

### Файл: `back/src/databases/operations.db.ts`

```typescript
export { OperationRecord, OperationMeta, YandexOcrOperationMeta } from '@miracle/types'; // или локально

export const operationsDb = registerDb('operations',
  await JsonCollection.create<OperationRecord>('operations')
);

export const operationsService = {
  create: (data: CreateEntityInput<OperationRecord>) => operationsDb.create(data),
  get: (id: string) => operationsDb.getById(id),
  update: (id: string, patch: UpdateEntityInput<OperationRecord>) => operationsDb.update(id, patch),
  listActive: () => operationsDb.ref().filter(op => !op.done),
};
```

---

## Часть 2: БД воркеров (`workers.db.ts`)

### Концепция

Воркер — запись о фоновой задаче. Не привязан к Яндексу и не предполагает polling. Это любая задача, которую нужно восстановить после рестарта.

```typescript
type WorkerStatus = 'active' | 'stopped' | 'failed';

// Мета конкретного типа воркера
type YandexOcrPollerMeta = {
  type: 'yandex-ocr-poller';
  operationId: string;     // ссылка на OperationRecord.id в operations.db
  fileContentId: string;
};

// Расширяется union-ом для новых типов воркеров
type WorkerMeta = YandexOcrPollerMeta; // | AnotherWorkerMeta

// Запись в БД
type WorkerRecord = {
  status: WorkerStatus;
  meta: WorkerMeta; // дискриминант — meta.type
};
```

### Файл: `back/src/databases/workers.db.ts`

```typescript
export const workersDb = registerDb('workers',
  await JsonCollection.create<WorkerRecord>('workers')
);

export const workersService = {
  create: (data: CreateEntityInput<WorkerRecord>) => workersDb.create(data),
  get: (id: string) => workersDb.getById(id),
  update: (id: string, patch: UpdateEntityInput<WorkerRecord>) => workersDb.update(id, patch),
  listActive: () => workersDb.ref().filter(w => w.status === 'active'),
};
```

---

## Часть 3: Классы воркеров

### Абстрактный базовый класс

**Файл:** `back/src/workers/base-worker.ts`

```typescript
export abstract class BaseWorker {
  abstract readonly type: string;

  // Полный жизненный цикл воркера: инициализация → работа → завершение
  // Воркер сам создаёт/обновляет свои записи в БД через сервисы
  abstract run(): Promise<void>;

  protected shouldStop = false;
  stop(): void { this.shouldStop = true; }
}
```

`run()` — единственный точка входа. Воркер сам управляет своей персистентностью.  
Поля специфичные для типа воркера (например, счётчик попыток) — внутри конкретного класса.

### YandexOcrWorker

**Файл:** `back/src/workers/yandex-ocr-worker.ts`

Параметры конструктора:
- `fileContentId` — для обновления FileContent по завершении
- `fileId`, `mimeType` — для создания OperationRecord и запуска OCR
- `existingOperationId?`, `existingCloudOperationId?` — для восстановления после рестарта (передаются из WorkerPool при restore)

Фазы `run()`:

1. **Создать OperationRecord** (или взять существующий при restore)
2. **Запустить OCR** через `TextRecognitionAsyncServiceClient.recognize()` → получить `cloudOperationId`
3. **Обновить OperationRecord** с `cloudOperationId`
4. **Создать WorkerRecord** `{ status: 'active', meta: { type: 'yandex-ocr-poller', operationId, fileContentId } }`
5. **Получить текущее состояние** через `OperationServiceClient.get({ operationId: cloudOperationId })` — работает и для свежих и для восстановленных операций
6. **Если не done** — `waitForOperation(op, session)` (SDK-метод, не кастомный polling)
7. **Получить текст** через `asyncClient.getRecognition({ operationId: cloudOperationId })` — стриминг страниц
8. **Обновить FileContent**: `{ status: COMPLETED, content: [{ page, text }] }`
9. **Обновить OperationRecord**: `{ done: true, result: text }`
10. **Обновить WorkerRecord**: `{ status: 'stopped' }` (или `'failed'` при ошибке)

При ошибке на любой фазе: обновить FileContent/OperationRecord/WorkerRecord в статус FAILED.

---

## Часть 4: WorkerPool

**Файл:** `back/src/workers/worker-pool.ts`

### Интерфейс

```typescript
class WorkerPool {
  // Вызывается при старте сервера — восстанавливает active воркеры из workers.db
  async restore(): Promise<void>;

  // Запускает воркер асинхронно (не ждёт завершения)
  launch(worker: BaseWorker): void;

  // Поиск активных воркеров по типу и опциональному предикату
  // Сервисы используют этот метод — не знают о конкретных классах воркеров
  find<T extends BaseWorker>(type: string, predicate?: (worker: T) => boolean): T[];
}

export const workerPool = new WorkerPool(); // синглтон
```

### Внутренняя реализация

```typescript
private active = new Map<string, BaseWorker>(); // ephemeralKey → worker

launch(worker: BaseWorker): void {
  const key = randomUUID(); // in-memory ключ, не связан с DB id
  this.active.set(key, worker);
  worker.run()
    .catch(err => console.error(`[WorkerPool] ${worker.type} failed:`, err))
    .finally(() => this.active.delete(key));
}
```

### restore() — логика восстановления

```typescript
async restore(): Promise<void> {
  const activeRecords = workersService.listActive();
  for (const record of activeRecords) {
    const worker = this.createWorkerFromRecord(record);
    if (worker) this.launch(worker);
  }
}

private createWorkerFromRecord(record: Stored<WorkerRecord>): BaseWorker | null {
  switch (record.meta.type) {
    case 'yandex-ocr-poller': {
      const op = operationsService.get(record.meta.operationId);
      if (!op || op.done) return null; // уже завершена, пропускаем
      const meta = op.meta as YandexOcrOperationMeta;
      return new YandexOcrWorker(
        meta.fileContentId, meta.fileId, meta.mimeType,
        op.id, op.cloudOperationId // existingOperationId, existingCloudOperationId
      );
    }
    default: return null;
  }
}
```

### Инициализация при старте сервера

В точке старта (где-то рядом с `app.listen()`):
```typescript
await workerPool.restore();
```

---

## Файловая структура

```
back/src/
├── databases/
│   ├── db.ts                     (существующий)
│   ├── operations.db.ts          (новый)
│   └── workers.db.ts             (новый)
├── workers/
│   ├── base-worker.ts            (новый)
│   ├── worker-pool.ts            (новый)
│   └── yandex-ocr-worker.ts     (новый)
types/src/
└── operations.ts                 (новый — OperationRecord, WorkerRecord и мета-типы)
```

---

## Решённые вопросы

1. **Типы в `@miracle/types`**: `OperationRecord`, `WorkerRecord`, все мета-типы (`OperationMeta`, `WorkerMeta`, и конкретные `YandexOcrOperationMeta`, `YandexOcrPollerMeta`) — в `types/src/`. Файл: `types/src/workers.ts`.

2. **`workersService.listActive()` использует `.ref()`**: нормально, LowDB однопоточный.
