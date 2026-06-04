# Миграция хранилища на Prisma + PostgreSQL

> Этот документ — единый план перехода `back-nest` с `JsonCollection` (lowdb, JSON-файлы)
> на Prisma ORM поверх PostgreSQL. Документ самодостаточен: его достаточно прочитать целиком,
> чтобы выполнить миграцию от установки до удаления legacy-слоя.

---

## 1. Контекст и цель

### Текущее состояние

`back-nest` хранит данные в JSON-файлах через абстракцию `JsonCollection`
(`back-nest/src/database/json-collection.ts`). Слой данных устроен так:

- `DatabaseService.onModuleInit` создаёт коллекции из `collections.ts`;
- каждая коллекция — типизированный `JsonCollection<T>` поверх одного `.json`-файла;
- базовые поля сущности (`id`, `createdAt`, `updatedAt`, `deletedAt`) описаны типом
  `DbEntity` в `@miracle/types`, а проставляются middleware-логикой коллекции;
- временные метки хранятся как Unix-таймстемпы (`number`, миллисекунды).

Всего девять коллекций: `users`, `sessions`, `productTypes`, `workers`, `files`,
`filesContent`, `jobRuns`, `technicalConditions`, `orders`.

### Почему переходим именно сейчас

База пуста, проект в активной разработке. Это единственный момент, когда смена движка
хранилища обходится без переноса данных и без обратной совместимости. Откладывание
увеличивает стоимость перехода линейно с объёмом накопленных данных.

### Целевая архитектура

| Аспект | Решение |
|---|---|
| СУБД | PostgreSQL 16 (в Docker для разработки) |
| ORM | Prisma 7 |
| Драйвер | `@prisma/adapter-pg` (driver adapter) поверх `pg` |
| Генератор клиента | новый генератор `prisma-client` (нативный ESM) |
| Временные метки | `DateTime` (вместо Unix-`number`) — см. §4 |
| Вложенные структуры | колонки типа `Json` (`jsonb`) — см. §4 |
| Доступ из сервисов | инъекция `PrismaService` (замена `DatabaseService`) |

### Принятые решения (зафиксированы до начала работ)

1. **Временные метки: колонка `DateTime` в БД, тип `Date | string` в контракте.**
   Идиоматично для Prisma/Postgres; маппинг дат на бэке не нужен. Влечёт правку `DbEntity`
   и мест на фронте, где ожидается число (см. §4 и §8).
2. **Глубоко вложенные модели хранятся в колонках `Json`.** Реляционные ключи
   (`authorId`, `fileId`, `productTypeId`) выносятся в отдельные колонки; остальное
   тело сущности кладётся в `jsonb` (см. §3).

---

## 2. Установка и инфраструктура

### 2.1. Docker Compose — только PostgreSQL

В отличие от `monitorium`, где Compose поднимал и backend, и frontend, для разработки
достаточно одного контейнера базы данных. NestJS продолжает запускаться локально через
`nest start --watch`.

Файл `docker-compose.yml` в корне монорепозитория:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: miracle_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - '${POSTGRES_HOST_PORT}:5432'
    volumes:
      - miracle-pg-data:/var/lib/postgresql/data

volumes:
  miracle-pg-data:
```

Том `miracle-pg-data` сохраняет данные между перезапусками контейнера. Полный сброс БД
(вместе с томом) выполняется командой `docker compose down -v`.

### 2.2. Переменные окружения

В `.env` корня монорепозитория добавляются:

```dotenv
# ── PostgreSQL (Docker) ──────────────────────────────────────────────────────
POSTGRES_USER=miracle
POSTGRES_PASSWORD=miracle
POSTGRES_DB=miracle
POSTGRES_HOST_PORT=5432

# Строка подключения для Prisma (CLI и runtime-адаптера).
# Хост — localhost, потому что Nest запускается вне Docker, а порт проброшен наружу.
DATABASE_URL=postgresql://miracle:miracle@localhost:5432/miracle?schema=public
```

Те же ключи (с примерными значениями) добавить в `.env.example`. Переменная `DB_DIR`
(каталог JSON-файлов) удаляется после завершения миграции (см. §7).

Важно про две роли `DATABASE_URL`:

- **CLI Prisma** (`migrate`, `db push`, `studio`) читает её из окружения, чтобы понять,
  куда подключаться;
- **Runtime-адаптер** (`@prisma/adapter-pg`) получает ту же строку из `AppConfigService`.

### 2.3. Установка пакетов

В рабочем пространстве `back-nest`:

```bash
npm install @prisma/client @prisma/adapter-pg pg --workspace=back-nest
npm install -D prisma dotenv-cli --workspace=back-nest
```

- `prisma` — CLI и движок миграций (dev-зависимость);
- `@prisma/client` — рантайм-клиент;
- `@prisma/adapter-pg` + `pg` — driver adapter (в Prisma 7 рекомендованный способ
  подключения);
- `dotenv-cli` — чтобы CLI-команды Prisma подхватывали `.env` из **корня** монорепо
  (Prisma по умолчанию ищет `.env` рядом со схемой и в cwd, а у нас он на два уровня выше).

### 2.4. Схема Prisma — начальный каркас

Файл `back-nest/prisma/schema.prisma`:

```prisma
generator client {
  provider     = "prisma-client"          // новый ESM-генератор (не prisma-client-js)
  output       = "../src/generated/prisma" // генерируется внутрь src
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ... модели (см. §3) ...
```

Замечания по генератору:

- Новый генератор `prisma-client` создаёт **нативный ESM-код**, что соответствует
  `"type": "module"` в `back-nest`. Старый `prisma-client-js` для нашего проекта не
  подходит без дополнительных ухищрений.
- Клиент генерируется в `src/generated/prisma`, поэтому импорт будет вида
  `import { PrismaClient } from '../generated/prisma/client.js'` (с расширением `.js`,
  как требует NodeNext-ESM).
- Сгенерированный каталог нужно исключить из проверок Biome и из системы контроля версий
  (добавить `src/generated/` в `.gitignore` и в `files.ignore` конфигурации Biome).

> Точный синтаксис конструктора адаптера и опции генератора следует сверить с
> документацией установленной версии Prisma 7 — API driver-адаптеров стабилизировалось
> недавно и могло уточниться в минорных релизах.

---

## 3. Адаптация существующих моделей

### 3.1. Принцип

Не нормализуем всё в реляционную форму на старте. Применяем гибрид:

- **поля, по которым выполняются связи и фильтрация** (внешние ключи, перечислимые
  статусы), выносятся в типизированные колонки;
- **глубоко вложенные структуры и дискриминированные объединения** хранятся как `Json`
  (`jsonb` в Postgres — полноценный тип с индексацией и запросами).

Это сохраняет гибкость на стадии разработки: форму `OrderDetails` или `WorkerData` можно
менять, **не трогая схему БД и не выполняя миграций**.

### 3.2. Таблица соответствия

| Коллекция (lowdb) | Модель Prisma | Реляционные колонки | Содержимое в `Json` |
|---|---|---|---|
| `users` | `User` | `email`, `login`, `role`, `password` | — |
| `sessions` | `Session` | `userId`, `accessToken`, `refreshToken` | — |
| `productTypes` | `ProductType` | `name` | `synonyms` (массив строк) |
| `files` | `File` | `name`, `extension`, `bytes`, `pages`, `authorId` | `settings` |
| `filesContent` | `FileContent` | `fileId` | `content`, `meta` |
| `orders` | `Order` | `authorId`, `fileId` | `details` |
| `technicalConditions` | `TechnicalCondition` | `name`, `fileId`, `productTypeId`, `lastProductTypeName` | `slotRules`, `displayTemplates` |
| `workers` | `Worker` | `type` (enum), `status` (enum) | `data` (тело объединения `WorkerData`) |
| `jobRuns` | `JobRun` | `job`, `status` | `input`, `output`, `error`, `progress`, `memo`, `cursor`, `steps` |

Примечания:

- `User.password` — backend-internal поле (его нет в публичном типе `User` из
  `@miracle/types`). В модели Prisma это `password String?`; маппинг в публичную форму
  остаётся в `UsersService.toPublic` как сейчас.
- `synonyms: string[]` хранится как `Json` (решение принято) — единообразно с остальными
  вложенными структурами.
- `Worker.type` и `JobRun.status` — стабильные перечисления, поэтому идут в колонки-enum,
  а изменчивое тело — в `Json`.

### 3.3. Перечисления (enum)

В `Json` уходят изменчивые структуры, а стабильные перечисления выносятся в Postgres-enum.
Кандидаты:

```prisma
enum UserRole {
  // значения берутся из @miracle/types → USER_ROLES
}

enum WorkerType {
  yandex_ocr_worker
  llm_vision_worker
  llm_vision_tc_worker
  order_details_worker
  tc_details_worker
  designation_worker
}

enum WorkerStatus {
  active
  success
  stopped
  failed
}

enum JobStatus {
  queued
  running
  succeeded
  failed
  cancelled
}
```

> **Решение:** значения enum в Postgres не могут содержать дефис, поэтому в схеме они
> записываются в snake_case (`yandex_ocr_worker`). В `@miracle/types` типы воркеров
> записаны через дефис (`'yandex-ocr-worker'`). На границе чтения/записи выполняется
> маппинг дефис ↔ подчёркивание — удобно вынести в пару чистых функций-конвертеров
> (`workerTypeToDb` / `workerTypeFromDb`) рядом с моделью или в `@miracle/types`.

### 3.4. Пример модели

```prisma
model Order {
  id        String   @id @default(uuid())
  authorId  String
  fileId    String?
  details   Json?               // OrderDetails целиком как jsonb

  author    User     @relation(fields: [authorId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@map("orders")
}

model Worker {
  id        String       @id @default(uuid())
  type      WorkerType
  status    WorkerStatus
  data      Json                 // тело WorkerData как jsonb

  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  deletedAt DateTime?

  @@map("workers")
}
```

### 3.5. Типизация `Json`-полей в сервисах

Prisma возвращает `Json`-поле как `JsonValue` (по сути `unknown`). Чтобы сохранить строгую
типизацию доменных типов (`OrderDetails`, `WorkerData`), на границе чтения выполняется
приведение:

```ts
const order = await this.prisma.order.findUnique({ where: { id } });
const details = order?.details as OrderDetails | null;
```

Это единственное место, где теряется автоматический контроль типов. Цена приемлема:
взамен форму вложенных структур можно менять без миграций БД.

---

## 4. Временные метки: тип `Date | string` в контракте

### Что меняется в типах

В базе колонки временных меток — `DateTime` (это решение неизменно, см. таблицу
архитектуры). Вопрос §4 — другой: **какого типа эти поля в общем контракте**
`@miracle/types`, который шарится между бэкендом и фронтом. Сейчас:

```ts
export type DbEntity = {
  id: string;
  createdAt: UnixTimestamp; // number
  updatedAt: UnixTimestamp; // number
  deletedAt?: UnixTimestamp | null;
};
```

### Суть развилки

Ключевой факт: одно и то же поле имеет **две разные рантайм-формы** на двух концах
системы, если между ними нет слоя преобразования:

- на **бэкенде** Prisma отдаёт нативный `Date` (объект);
- по **HTTP** `Date` сериализуется в ISO-строку (`JSON.stringify(date)`), и на **фронте**
  после `response.json()` в поле лежит уже `string` — `Date` не восстанавливается.

Отсюда три возможных типа в контракте:

| Тип в `@miracle/types` | Маппинг на бэке | Честность типа |
|---|---|---|
| `Date` | нулевой (отдаём Prisma как есть) | врёт фронту: там всегда `string`, а не `Date` |
| `string` (ISO) | нужен `Date → toISOString()` в каждом маппере | точен на проводе, но неудобен на бэке |
| **`Date \| string`** | **нулевой** | **покрывает обе стороны честно** |

### Принятое решение: `Date | string`

Выбираем `Date | string`. Это сознательно отражает реальность: на стороне бэкенда значение
— `Date` (его кладёт Prisma), на стороне фронта — `string` (его принёс JSON). Поскольку мы
выбрали путь **без маппинга дат** (бэкенд отдаёт Prisma-объект почти как есть — см. §5.4),
тип обязан допускать оба варианта, иначе он лгал бы об одной из сторон.

```ts
export type DbEntity = {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
};
```

Главный выигрыш — **ноль преобразований дат на бэкенде**: `Date` от Prisma напрямую
присваивается полю `Date | string`, маппер (`toPublic` и аналоги) занимается только
отбрасыванием секретных полей и приведением `Json`, но не датами. Это прямо снимает то
многословие, которого мы опасались.

### Что это требует от фронта

Цена `Date | string` платится на фронте: union **заставляет** обрабатывать поле явно —
TypeScript не даст вызвать `value.getTime()` напрямую (на `string` такого метода нет).
Правильное обращение — нормализовать через конструктор, который принимает оба варианта:

```ts
// единый хелпер на фронте — оборачивает и Date, и ISO-строку
const toDate = (v: Date | string): Date => new Date(v);

// использование
toDate(order.createdAt).getTime();        // безопасно для обоих случаев
format(toDate(order.createdAt), 'dd.MM'); // date-fns / dayjs принимают и так
```

Этот хелпер вводится один раз; места, где сейчас на фронте выполняется арифметика с
числовым таймстемпом, правятся отдельной задачей после переезда бэкенда (поиск по
обращениям к `createdAt`/`updatedAt`/`deletedAt` — см. §8).

### Честная оговорка

`Date | string` формально **шире**, чем реальность на каждом конкретном конце: на бэке
поле всегда `Date`, на фронте всегда `string`, «оба сразу» не бывает нигде. Union маскирует
это как неопределённость. Это осознанный компромисс ради нулевого маппинга — ровно тот
путь, по которому идёт monitorium (там в типах встречаются и `Date`, и `Date | string`).
Если в будущем захочется строгой честности типа на каждой стороне — это переход на `string`
+ слой сериализации `Date → ISO` на бэке; цена такого перехода невелика и его можно сделать
позже, не ломая фронт (который уже нормализует через `toDate`).

---

## 5. Замена слоя доступа: `PrismaService`

### 5.1. Сервис-обёртка

`back-nest/src/database/prisma.service.ts`:

```ts
import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    const adapter = new PrismaPg({ connectionString: config.databaseUrl });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

Потребуется добавить геттер `databaseUrl` в `AppConfigService` и ключ `DATABASE_URL` в
`envSchema` (`back-nest/src/config/env.schema.ts`):

```ts
DATABASE_URL: z.string().url(),
```

### 5.2. Модуль

`back-nest/src/database/database.module.ts` остаётся `@Global()`, но регистрирует
`PrismaService` вместо `DatabaseService`. Это сохраняет единственную точку импорта в
`app.module.ts`.

### 5.3. Соответствие методов

Методы `JsonCollection` ложатся на Prisma почти один к одному. Таблица для переписывания
сервисов:

| `JsonCollection<T>` | Prisma |
|---|---|
| `list()` | `prisma.model.findMany()` |
| `getById(id)` | `prisma.model.findUnique({ where: { id } })` |
| `ref().filter(p)` | `prisma.model.findMany({ where: { ... } })` |
| `create(input)` | `prisma.model.create({ data })` |
| `update(id, patch)` | `prisma.model.update({ where: { id }, data })` |
| `softDelete(id, true)` | `prisma.model.update({ where: { id }, data: { deletedAt: new Date() } })` |
| `delete(id)` | `prisma.model.delete({ where: { id } })` |

Существенные отличия:

- `id` больше не генерируется вручную (`randomUUID`) — это делает `@default(uuid())` в схеме;
- `createdAt`/`updatedAt` проставляются Prisma (`@default(now())` / `@updatedAt`), а не
  middleware-логикой коллекции;
- `update` Prisma выполняет поверхностное слияние; глубокого merge (как `ts-deepmerge` в
  `JsonCollection.update`) больше нет. Если где-то полагались на глубокое слияние вложенных
  объектов — нужно собирать новое значение `Json`-поля в сервисе явно;
- сортировки (`sort((a,b) => b.createdAt - a.createdAt)` в `SessionsService`) переезжают
  в `orderBy: { createdAt: 'desc' }`.

### 5.4. Граница типов: Prisma → `@miracle/types`

Prisma-клиент возвращает **свои** сгенерированные типы (`prisma.user.findUnique()` →
`User` из `src/generated/prisma`). Эти типы **нельзя возвращать из контроллера напрямую** —
по трём причинам:

1. **Граница генератора клиента.** Генератор (`tools/src/client-generator-nest`) реэкспортит
   во фронт только **не-относительные** импорты (`export type { User } from '@miracle/types'`).
   Тип из `../generated/prisma` — относительный импорт; генератор попытается скопировать его
   как локальную backend-декларацию, но Prisma-типы скопировать нельзя (они тянут внутренние
   generic-типы рантайма Prisma) → поломка генерации.
2. **Лишние/секретные поля.** Prisma-тип `User` содержит `password`, которого нет в публичном
   `User`.
3. **`Json`-поля** приходят как `JsonValue` вместо доменного `OrderDetails`/`WorkerData`.

**Правило:** контроллер возвращает тип из `@miracle/types` (обычно `Stored<DomainType>`) с
**явной аннотацией** возвращаемого типа. Аннотация обязательна не только стилистически —
генератор в `resolveResponseType` предпочитает синтаксическую аннотацию выведенному типу.

```ts
@Get(':id')
getById(@Param('id') id: string): Stored<User> {   // ← явная аннотация для генератора
    return this.users.getPublicById(id);
}
```

Превращение Prisma-типа в доменный делает **маппер в сервисе** (как текущий `toPublic`).
Благодаря решению §4 (`Date | string` в контракте) маппер **не трогает даты** — `Date` от
Prisma присваивается полю `Date | string` напрямую. Остаются две задачи:

```ts
// 1. отбросить секретные поля
private toPublic(row: PrismaUser): Stored<User> {
    const { password: _password, ...rest } = row;
    return rest;                          // даты — как есть, без toISOString()
}

// 2. привести Json к доменному типу при чтении (это приведение, не пересборка)
const details = order.details as OrderDetails | null;
```

Значение, которое сервис **конструирует сам** (составной ответ, примитив), маппера не
требует — достаточно аннотации сигнатуры.

---

## 6. Судьба `DbEntity`, `Stored`, `StoredEntity` и legacy-кода

Это прямой ответ на вопрос: что из существующих типов остаётся, а что удаляется.

### 6.1. Принцип разделения

Ключевое наблюдение: сгенерированные Prisma типы (`User`, `Order`, …) **уже содержат**
`id`, `createdAt`, `updatedAt` — добавлять их обёрткой не нужно. Однако сгенерированный
клиент живёт **только на бэкенде**; фронт его импортировать не должен. Поэтому общий
пакет `@miracle/types` остаётся каноническим источником доменных форм для фронта, а
типы Prisma используются исключительно внутри слоя доступа на бэке.

Из этого следует разделение типов на «контрактные» (остаются) и «инфраструктурные lowdb»
(удаляются).

### 6.2. Что остаётся

| Тип | Где | Почему остаётся |
|---|---|---|
| `DbEntity` | `types/src/db.ts` | Это **контракт API**, а не деталь lowdb: описывает поля, которые сервер возвращает у персистентной сущности. Меняется только тип временных меток (§4). |
| `Stored<T> = T & DbEntity` | `types/src/db.ts` | Остаётся. Это правильная абстракция «доменная форма + поля БД», которую потребляют сервисы и сгенерированные клиенты фронта. От lowdb не зависит — чистая алгебра типов. Интуиция верная. |
| `DeletableEntity`, `hasDeletion` | `types/src/db.ts` | Остаются, если сохраняется мягкое удаление (`deletedAt` остаётся колонкой). |

### 6.3. Что удаляется (вместе с lowdb)

| Тип / файл | Почему удаляется |
|---|---|
| `back-nest/src/database/json-collection.ts` целиком | Реализация поверх lowdb. Заменяется `PrismaService`. |
| `StoredEntity<T>` | Дистрибутивный вариант `Stored`, нужный был механике коллекций. Единственный внешний потребитель — `AuthenticatedUser = StoredEntity<User>`; заменяется на `Stored<User>` (для `User`, где `id?` опционально, пересечение `User & DbEntity` корректно делает `id` обязательным). |
| `CreateEntityInput<T>`, `UpdateEntityInput<T>` | Формы входов lowdb. Их роль берут на себя сгенерированные Prisma input-типы (`Prisma.OrderCreateInput`) либо доменные DTO. |
| `CollectionData<T>`, `CollectionMiddleware<T>` | Внутренняя кухня `JsonCollection`. |
| `DatabaseService`, `collections.ts` | Заменяются `PrismaService`. `UserInternal` (из `collections.ts`) переезжает либо в модуль `users/`, либо выражается напрямую через тип Prisma. |
| Пакеты `lowdb`, `ts-deepmerge` в `back-nest/package.json` | Больше не используются после удаления `JsonCollection`. |

### 6.4. Резюме

> `DbEntity` и `Stored` — **остаются**: это контракт API, а не часть lowdb.
> `StoredEntity`, `CreateEntityInput`, `UpdateEntityInput` и весь `json-collection.ts` —
> **удаляются** вместе с lowdb. Гипотеза из вопроса подтверждается полностью.

---

## 7. Миграции: рабочий цикл

Это ключевой раздел для понимания работы со схемой. Разводим два режима.

### 7.1. Пока база пуста (текущий режим)

Файлы миграций **не нужны**. Используется прямая синхронизация схемы с базой:

- `prisma db push` — приводит базу в соответствие со `schema.prisma`, без истории миграций;
- `prisma migrate reset` — полностью сбрасывает базу и накатывает схему заново
  (плюс выполняет seed).

Цикл разработки: правим `schema.prisma` → `db push` → при необходимости `reset`. Никаких
ручных SQL-файлов. Этим режимом живём, пока схема нестабильна.

### 7.2. Когда появятся данные, которые нельзя потерять

С первого развёртывания на окружении с реальными данными переходим на версионируемые
миграции:

1. Однократно: `prisma migrate dev --name init` — фиксирует текущую схему как базовую
   миграцию (создаёт `prisma/migrations/<timestamp>_init/migration.sql`).
2. Далее каждое изменение схемы — через `prisma migrate dev`, который сам генерирует
   SQL-файл и применяет его.
3. На production — `prisma migrate deploy` (применяет только ожидающие миграции, ничего
   не генерирует).

### 7.3. Миграции с сохранением данных — «ручные миграции»

Принципиальный момент: **миграции Prisma — это обычные SQL-файлы**, которые можно
редактировать вручную. Деления на «призмовские» и «ручные» нет — это одно и то же.

Когда автоматически сгенерированная миграция уничтожила бы данные (например, Prisma
предлагает `DROP COLUMN` + `ADD COLUMN` при переименовании), используется режим
с ручной правкой:

```bash
prisma migrate dev --create-only   # генерирует SQL, но НЕ применяет
# → открываем migration.sql, заменяем разрушительный SQL на сохраняющий данные
#   (ALTER ... RENAME COLUMN; UPDATE ... для backfill; INSERT ... SELECT для переноса)
prisma migrate dev                 # теперь применяет отредактированный файл
```

Классические сценарии:

- **переименование колонки**: вместо `DROP`/`ADD` — `ALTER TABLE ... RENAME COLUMN`;
- **разбиение таблицы**: добавить новую → `INSERT ... SELECT` для переноса данных →
  отдельной миграцией удалить старую (паттерн expand → migrate → contract);
- **заполнение нового NOT NULL-поля**: добавить как nullable → `UPDATE` для backfill →
  отдельной миграцией сделать NOT NULL.

> Вывод по исходному вопросу: «ручные миграции» = `migrate dev --create-only` + правка SQL.
> Это штатный режим Prisma, а не его обход. Осваивать его нужно **не сейчас**, а при
> появлении production с данными. До тех пор — `db push` и `reset`.

### 7.4. Скрипты в `back-nest/package.json`

Все CLI-команды Prisma оборачиваются в `dotenv-cli`, чтобы подхватить корневой `.env`:

```json
{
  "scripts": {
    "db:up": "docker compose -f ../docker-compose.yml up -d postgres",
    "db:down": "docker compose -f ../docker-compose.yml down",
    "db:reset-hard": "docker compose -f ../docker-compose.yml down -v",
    "prisma:generate": "dotenv -e ../.env -- prisma generate",
    "prisma:push": "dotenv -e ../.env -- prisma db push",
    "prisma:reset": "dotenv -e ../.env -- prisma migrate reset",
    "prisma:studio": "dotenv -e ../.env -- prisma studio",
    "prisma:seed": "dotenv -e ../.env -- tsx prisma/seed.ts",
    "prisma:import-product-types": "dotenv -e ../.env -- tsx prisma/import-product-types.ts",
    "prisma:import-technical-conditions": "dotenv -e ../.env -- tsx prisma/import-technical-conditions.ts",
    "prisma:migrate": "dotenv -e ../.env -- prisma migrate dev"
  }
}
```

(`prisma:migrate` пригодится только в фазе §7.2; путь к `.env` — относительно `back-nest/`.)

---

## 8. Seed (тестовые данные)

Файл `back-nest/prisma/seed.ts` наполняет базу демо-данными. Запускается вручную
(`npm run prisma:seed`) и автоматически в составе `prisma migrate reset`. Использует тот же
сгенерированный клиент:

```ts
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient(/* adapter — см. PrismaService */);

async function main() {
  // создание демо-пользователей, типов продукции и т.п.
}

main().finally(() => prisma.$disconnect());
```

Для запуска seed как standalone-скрипта (вне Nest) адаптер создаётся прямо в файле, по той
же схеме, что и в `PrismaService`.

### Импорт из legacy `back/data/`

После `prisma migrate` / `db push` и поднятия Postgres:

```bash
cd back-nest
npm run prisma:import-product-types      # product-types.json → product_types
npm run prisma:import-technical-conditions  # technical-conditions.json → technical_conditions (конвертация rules+designationSlots → slotRules)
```

Скрипт ТУ читает старый JSON и при upsert собирает `slotRules`: если есть `designationSlots`,
склеивает `ruleIds` в `text`; иначе переносит только `rules` как секции с `index` 0..n.

---

## 9. Принятые решения

Все развилки закрыты:

1. **Формат временных меток** (§4): тип `Date | string` в контракте. Колонка в БД —
   `DateTime`; маппинг дат на бэке не выполняется (Prisma `Date` присваивается напрямую);
   фронт нормализует поля хелпером `toDate(v) => new Date(v)`.
2. **`Worker.type`** (§3.3): Postgres-enum со значениями в snake_case + пара функций-
   конвертеров дефис ↔ подчёркивание на границе.
3. **`sessions`**: остаётся полноценной таблицей в БД.
4. **`synonyms` в `ProductType`** (§3.2): `Json`.
5. **Окружение production**: пока не определено — не блокирует работу. Переход на
   версионируемые миграции (§7.2) откладывается до появления окружения с реальными
   данными. Практическая работа с миграциями вынесена в отдельную памятку
   [`migrations-guide.md`](./migrations-guide.md).

---

## 10. Порядок выполнения (чек-лист)

Инфраструктура:

1. Создать `docker-compose.yml` (только Postgres) в корне.
2. Добавить `POSTGRES_*` и `DATABASE_URL` в `.env` и `.env.example`.
3. Установить пакеты (§2.3).
4. Поднять базу: `docker compose up -d postgres`.

Схема и клиент:

5. Создать `back-nest/prisma/schema.prisma` (генератор + datasource + все модели §3).
6. Добавить `DATABASE_URL` в `envSchema` и геттер `databaseUrl` в `AppConfigService`.
7. `prisma:generate`, затем `prisma:push` — поднять схему в пустой базе.
8. Исключить `src/generated/` из Biome и из git.

Слой доступа:

9. Написать `PrismaService` (§5.1), перевести `DatabaseModule` на него.
10. Переписать сервисы доменов с `db.collections.X` на `prisma.X` (§5.3):
    `users`, `sessions`, `product-types`, `files`, `files-content`, `orders`,
    `technical-conditions`, `workers`, `jobs`/`jobRuns`.

Типы и очистка legacy:

11. Поправить `DbEntity` (§4), заменить `StoredEntity<User>` на `Stored<User>`.
12. Удалить `json-collection.ts`, `collections.ts`, `DatabaseService`, неиспользуемые
    типы (`StoredEntity`, `CreateEntityInput`, `UpdateEntityInput`) и пакеты
    `lowdb`/`ts-deepmerge`.

Данные:

13. Написать `prisma/seed.ts`, проверить `prisma:reset` (сброс + сид).

> На каждом шаге переписывания сервиса канонический образец — домен `users/`
> (см. соглашения в `.agents/plans/nest-migration/README.md`). После миграции `users/`
> остаётся эталонным: если паттерн доступа к Prisma меняется, сначала обновляется `users/`,
> затем этот документ.
```
