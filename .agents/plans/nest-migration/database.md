# Паттерн: работа с БД

## Когда применять

- Добавляешь новую коллекцию (например, `orders`, `product-types`).
- Получаешь доступ к существующей коллекции из сервиса.
- Сомневаешься, где должно жить объявление БД-сущности.

## Контекст

В `back-nest` слой данных устроен так:

- **`back-nest/src/database/json-collection.ts`** — реализация `JsonCollection` (скопирована из старого `back`, только `DB_DIR` теперь параметр, а не модульная константа). Этот файл **не редактируй** при добавлении доменов.

- **`back-nest/src/database/collections.ts`** — **центральное** объявление всех коллекций проекта. Это единственное место, где создаются экземпляры `JsonCollection`. Сюда добавляются новые сущности.

- **`back-nest/src/database/database.service.ts`** — `@Injectable()`, инициализирует data-dir и коллекции в `onModuleInit`. Экспортирует поле `.collections`.

- **`back-nest/src/database/database.module.ts`** — глобальный модуль (`@Global()`), регистрирует `DatabaseService`. Импортируется один раз в `app.module.ts`.

В **старом** `back` коллекция и сервис жили в одном файле (`back/src/databases/file.db.ts` содержит и `filesDb`, и `filesService`). В `back-nest` это разделено — см. также `service.md`.

## Где данные на диске

`JsonCollection` пишет в директорию, которая резолвится так:

1. Если задана env-переменная `DB_DIR` — используется она.
2. Иначе — `<cwd>/data`. При запуске из `back-nest/` это `back-nest/data/`.

В `.env` корня монорепы можно поставить `DB_DIR=./back/data`, чтобы использовать данные старого `back` (после cutover). Параллельный запуск `back` и `back-nest` на одной директории **запрещён** (JsonCollection не атомарна между процессами).

## Добавление новой коллекции

### Шаг 1 — открыть `back-nest/src/database/collections.ts`

Сейчас выглядит так (минимальная стартовая версия):

```ts
import type { User } from '@miracle/types';
import { JsonCollection } from './json-collection.js';

export type UserInternal = User & { password: string };

export async function createCollections(dbDir: string) {
    return {
        users: await JsonCollection.create<UserInternal>('users', dbDir),
    } as const;
}

export type Collections = Awaited<ReturnType<typeof createCollections>>;
```

### Шаг 2 — добавить новую сущность

```ts
import type { User, Order, ProductType } from '@miracle/types';
import { JsonCollection } from './json-collection.js';

export type UserInternal = User & { password: string };

export async function createCollections(dbDir: string) {
    return {
        users: await JsonCollection.create<UserInternal>('users', dbDir),
        orders: await JsonCollection.create<Order>('orders', dbDir),                // ← новое
        productTypes: await JsonCollection.create<ProductType>('product-types', dbDir), // ← новое
    } as const;
}

export type Collections = Awaited<ReturnType<typeof createCollections>>;
```

Соглашения:

- **Ключ объекта** — camelCase в множественном числе (`users`, `orders`, `productTypes`, `technicalConditions`).
- **Имя файла на диске** — kebab-case (первый аргумент `JsonCollection.create`): `'users'`, `'orders'`, `'product-types'`. Это совпадает с именами `.json`-файлов в старом `back/data/`.
- **Тип элемента** — из `@miracle/types`. Если в БД хранятся **дополнительные поля** (как `password` у `User`), объяви локальный `*Internal`-тип здесь же. Не клади его в `@miracle/types` — это backend-internal.

### Шаг 3 — использовать в сервисе

Зайти в `<domain>.service.ts`, инжектить `DatabaseService` и работать через `this.db.collections.<key>`:

```ts
@Injectable()
export class OrdersService {
    constructor(private readonly db: DatabaseService) {}

    async create(userId: string, fileId?: string): Promise<Stored<Order>> {
        return this.db.collections.orders.create({ userId, fileId });
    }
}
```

`Collections`-тип выводит TypeScript автоматически — IDE подскажет `orders`, `productTypes` и т.д. без ручной типизации.

## API `JsonCollection<T>`

Методы (повторяют старый `back/src/databases/db.ts`):

| Метод | Возвращает | Что делает |
|---|---|---|
| `ref()` | `StoredEntity<T>[]` | Сырой массив — без копирования, для фильтров/обходов. **Не мутировать** напрямую. |
| `list()` | `StoredEntity<T>[]` | Глубокая копия массива. |
| `getById(id)` | `StoredEntity<T> \| undefined` | Глубокая копия одного элемента. |
| `create(input)` | `StoredEntity<T>` | Создаёт запись, генерирует id если не задан, ставит `createdAt`/`updatedAt`. |
| `update(id, patch)` | `StoredEntity<T> \| undefined` | Применяет patch через ts-deepmerge, обновляет `updatedAt`. Возвращает undefined если не найдено. |
| `softDelete(id, mark)` | `StoredEntity<T> \| undefined` | Ставит/снимает `deletedAt`. Запись остаётся в коллекции. |
| `delete(id)` | `boolean` | Жёсткое удаление. |

Все методы, изменяющие состояние, асинхронные (`await db.write()` внутри). Чтения синхронные.

## Стороны: фильтрация и `ref()` vs `list()`

`ref()` отдаёт **тот самый массив** из БД, без копирования. Это эффективно для фильтров (`filter`, `find`, `sort`):

```ts
const userOrders = this.db.collections.orders.ref()
    .filter(order => order.userId === userId);
```

Но **никогда не мутируй** результат `ref()` напрямую (`.push`, `.splice`, изменение элементов). Это приведёт к рассинхронизации между in-memory state и файлом на диске. Для мутаций — только `create`/`update`/`delete`.

`list()` — глубокая копия. Используй когда нужно отдать клиенту или передать в код, которому ты не доверяешь.

## Internal-формы (как `UserInternal`)

Когда в БД хранится больше полей, чем разрешено отдавать клиенту (как `password` у `User`), есть две схемы:

**A. Тип `UserInternal` в `collections.ts` + маппинг в сервисе.** Используется сейчас:

```ts
// collections.ts
export type UserInternal = User & { password: string };
// users: JsonCollection<UserInternal>

// users.service.ts
getPublicById(id: string): Stored<User> {
    const user = this.db.collections.users.getById(id);
    if (!user) throw new NotFoundException(...);
    const { password: _password, ...publicUser } = user;
    return publicUser as Stored<User>;
}
```

**B. Internal-тип в самом домене.** Тоже допустимо, если internal-форма используется только внутри одного модуля и не нужна другим сервисам. Тогда импортируй её в `collections.ts`:

```ts
// users/users.types.ts
export type UserInternal = User & { password: string, lastLoginAt?: number };

// collections.ts
import type { UserInternal } from '../users/users.types.js';
```

По умолчанию используй вариант A — он держит все БД-типы в одном месте.

## Что НЕ делать

- **Не создавать `JsonCollection` внутри сервиса или модуля домена.** Только централизованно в `collections.ts`. Если ты пишешь `new JsonCollection(...)` или `JsonCollection.create(...)` вне `collections.ts` — это антипаттерн.
- **Не использовать `process.env.DB_DIR` напрямую.** Доступ через `AppConfigService.dbDir`.
- **Не пользоваться `registerDb` / `DbRegistry`-паттерном из старого `back`.** В `back-nest` это не перенесено — `DatabaseService` и `Collections`-тип заменяют этот механизм.
- **Не открывать сырой `lowdb`** (`Low`, `JSONFile`) в коде доменов. Только через `JsonCollection`.

## Типичные грабли

- **Изменил `collections.ts`, забыл импорт типа** — TS-ошибка про unknown type. Все типы — из `@miracle/types` (или из локального `<domain>.types.ts`).
- **Использовал ключ в snake_case или kebab-case** (`product_types`, `product-types`) — нарушение convention. Только camelCase: `productTypes`.
- **Имя файла на диске не совпадает со старым `back/data/`** — данные не подхватятся при cutover. Если в `back/data/` есть `product-types.json`, в `collections.ts` это должно быть `JsonCollection.create<ProductType>('product-types', dbDir)` — kebab-case в первом аргументе.
- **Доступ к коллекции до `onModuleInit`** — `this.db.collections` ещё `undefined`. Не вызывай БД из конструктора сервиса; используй `OnModuleInit`/`OnApplicationBootstrap` если нужно что-то делать на старте.

## Живой пример

`back-nest/src/database/collections.ts` — минимальная стартовая версия с одной коллекцией `users`.

`back-nest/src/users/users.service.ts` — пример сервиса, который через `DatabaseService.collections.users` достаёт пользователя и маппит в public-форму.
