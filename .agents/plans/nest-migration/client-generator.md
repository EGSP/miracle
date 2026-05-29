# Новый генератор клиента: `client-generator-nest`

> Этот документ — инструкция агенту, который пишет генератор HTTP-клиента **с нуля** для `back-nest` (NestJS).
> Документ опирается на разбор двух существующих реализаций — миракловского `client-generator` и старого `client-generator` из прошлого проекта (Nest+Prisma). Финальная цель — рабочий генератор в `tools/src/client-generator-nest/`, который умеет всё, что умеет миракловский, плюс понимает NestJS-декораторы.

## Context

В монорепе уже есть два разных генератора:

1. **`tools/src/client-generator/`** — текущий миракловский генератор. Заточен под кастомный typed-routing (`defineApp` / `defineRouter` / `route.*`). Работает почти без конфига — по конвенции знает, где у Miracle живут вход, выход и mutator.

2. **`<external>/packages/client-generator/`** — старый генератор из прошлого проекта. Заточен под NestJS-декораторы (`@Controller`, `@Get`, `@Body`, …). Имеет плагин-систему (Prisma enum), `ModelRegistry` с topoSort, режимы `bundle`/`split`, конфиг-файл с `repoRoot`.

После миграции на `back-nest` (NestJS) старый миракловский генератор работать не будет — он ищет `defineApp`. Новый генератор должен жить **рядом**, в `tools/src/client-generator-nest/`, и обслуживать `back-nest`. Старый `client-generator` пока остаётся (он обслуживает `back/` до конца миграции).

Ключевая ценность миракловского подхода, которую **обязательно** сохранить — **минимум конфигурации**. Дефолты выводятся из структуры монорепы, конфиг-файл нужен только если хочется что-то переопределить.

## Сравнение двух реализаций

| Аспект | Миракловский `client-generator` | Старый `client-generator` (Nest+Prisma) |
|---|---|---|
| **Источник правды** | `defineApp([...routers])` — явный массив | Скан `*.controller.ts` в дереве бэкенда |
| **Конфиг** | TS-файл `front/src/lib/client-generator.config.ts`, всё по конвенции | `.cjs`/`.json`, обязательный `repoRoot`, много полей |
| **Discovery** | Один entry-point, разворачивается через AST | File-system scan + tsconfig paths |
| **Извлечение типов** | TypeScript type printer (`type.getText(NoTruncation)`) + нормализация `import("...")` | `ModelRegistry` + BFS + topoSort, эмитит `interface` |
| **Локальные DTO** | Эмитятся как `type` aliases в per-router models | Эмитятся как `interface` с возможным `modelSuffix` (`CreatePostDtoModel`) |
| **Shared-типы** | `@miracle/types` импортируется как есть | `sharedTypesPackage` импортируется как есть |
| **Внешние enum'ы** | Не поддерживает (не нужно) | Plugin `prisma` достаёт enum из `@prisma/client` |
| **Модели на выходе** | Один `common.models.ts` + по `<router>.models.ts` | `bundle` (один файл) или `split` (файл на тип) |
| **URL** | Раз `prefix + path`, формат `:param` | `${globalPrefix}/v${version}/${ctrl}/${method}` |
| **Mutator** | Импорт из конфига (`customInstance`) | То же |
| **Mutator-вызов** | `customInstance<Response>({method, url, params, data})` | То же, плюс `formatPath` helper |
| **`satisfies` для response** | **Понимает** — берёт тип из `satisfies T` явно | Нет — берёт return-type декларацию |
| **`err.*` returns** | Понимает — отфильтровывает из success-типов | Нет (Nest бросает исключения) |
| **Линий кода** | ~1500 (extract.ts 902 + writers 249 + остальное) | ~1150 |
| **Плагины** | Нет | Да (`resolveExternalTypes`, `afterWrite`) |
| **CLI** | `tsx index.ts [config-path]` | `cli.js --config ...` с fallback-конфигом |
| **Pre-emit cleanup** | `rm -rf outputDir` каждый запуск | Только `.ts` в `models/` |

> **Отличие нового генератора от обоих:** DTO-классы он не «разворачивает» в структуру. Все входные DTO в `back-nest` — это тонкая обёртка `class XxxDto extends createZodDto(XxxSchema) {}` над zod-схемой из `@miracle/types/src/schemas/` (см. [dto.md](./dto.md)). Поэтому генератор просто эмитит `interface XxxDto extends z.infer<typeof XxxSchema> {}`, импортируя `XxxSchema` из `@miracle/types`. Никакого type-printer для DTO, никакого BFS по полям, никакого копирования схем — единый источник правды живёт в `@miracle/types`.

## Что взять откуда

### Из миракловского (сохранить):

1. **Минимальный конфиг по конвенции.** Дефолт: `input = back-nest/src/app.module.ts`, `output = front/src/lib/generated`, `customInstance = front/src/lib/api`. Конфиг-файл не обязателен.
2. **Поиск workspace-root** через `package.json` с `workspaces` — для авто-резолва путей.
3. **TypeScript type printer** для типов из `@miracle/types` и других workspace-пакетов — без BFS/topoSort/ModelRegistry эти типы импортируются как есть.
4. **Нормализация `import("...").TypeName`** — TS-инференция часто возвращает типы в такой форме, нужно превращать в `import type { TypeName } from '<package>'`.
5. **`collectExternalImportsFromSourceFile`** — fallback, когда type printer уже сократил `import(...)` до имени.
6. **Раскладка: один `*.client.ts` + один `*.models.ts` на контроллер** + общий `common.models.ts` для shared backend-local типов.
7. **`http.ts` с `formatPath`** — clean URL-шаблонизация с `encodeURIComponent`.
8. **`rm -rf outputDir`** перед записью — гарантия отсутствия зомби-файлов от старой структуры.
9. **TS-конфиг как файл с `export default`**, загружается через dynamic `import(...?t=Date.now())` для cache-busting.

### Из старого (адаптировать):

1. **Парсинг NestJS-декораторов:**
   - `@Controller(path | { path, version })` на классе → префикс
   - `@Get/@Post/@Put/@Patch/@Delete(path?)` на методе → HTTP-метод и путь
   - `@Body() / @Query(name?) / @Param(name?)` на параметрах → клиентские аргументы
   - `@Req() / @Res()` — игнорировать (сервер-only)
   - Метод с модификатором `private`/`protected` — пропускать
2. **Multiple `@Query('field')` → один query-объект на клиенте.** Логика `mergeMultipleQueryFields` из старого `parse.ts`. Несколько `@Query('a')` + `@Query('b')` в сигнатуре handler-а собираются в один `params: { a, b }` на клиенте.
3. **`builtinTypeNames`** — список встроенных типов, которые **не** считаются "пользовательскими" при сборе зависимостей (`Promise`, `Date`, `Record`, `Array`, ...). У миракла он лежит inline в `extract.ts`, у старого — отдельная константа с возможностью кастомизации. Возьми **старый подход** — отдельная экспортируемая константа с возможностью расширить через конфиг.
4. **`unwrapPromise`** — снимать внешний `Promise<...>`, потому что Nest-handlers возвращают Promise (`async` методы).
5. **Плагин-система** — **оставить интерфейс**, но **без встроенных плагинов**. Prisma не нужен. Опциональная точка расширения на будущее (например, если появятся внешние union-типы).
6. **`strictTypes`-флаг** — опционально падать при типах, которые нельзя перенести (например, ссылка на класс из `node_modules`, не покрытая плагином). По умолчанию — `false`.

### Что НЕ брать:

1. **`repoRoot` в конфиге** — миракловский авто-резолв (`findWorkspaceRoot`) лучше.
2. **`modelsLayout: bundle`** — миракловская раскладка (per-router) уже выбрана, она удобнее для тримшейкинга и навигации.
3. **`modelSuffix`** — не нужно. В Miracle DTO-классы имеют осмысленные имена (`CreateOrderDto`, `OrdersQueryDto`), коллизии с `@miracle/types` маловероятны (там нет таких суффиксов).
4. **`globalPrefix` и `version`** — в `back-nest` Nest запускается **без** `setGlobalPrefix` и без версионирования (см. [back-nest/src/main.ts](../../back-nest/src/main.ts)). Декоратор `@Controller({ version })` тоже не используется. URL — это просто `prefix + path`.
5. **Plugin Prisma** — у Miracle нет Prisma.
6. **Регенерация интерфейсов через `ModelRegistry`** для DTO. Не нужно: для DTO эмитим тонкий `interface … extends z.infer<typeof Schema> {}`, а schema живёт в `@miracle/types` и импортируется напрямую (см. [dto.md](./dto.md)).
7. **Структурный type-printer для DTO** (`type.getText()` по class instance shape). Не нужно по той же причине — мы не разворачиваем DTO, а делегируем форму схеме.

## Архитектура нового генератора

### Discovery: AppModule walk, не file-scan

Старый генератор сканирует `*.controller.ts` в `apps/backend/src/`. Это работает, но даёт ложные срабатывания на устаревших/staged файлах и не отражает реальный граф приложения.

Миракловский подход — **читать центральный entry-point** (`defineApp`). Для Nest эквивалент — **`AppModule`**. Алгоритм:

1. Открыть `back-nest/src/app.module.ts` через `ts-morph`.
2. Найти декоратор `@Module(...)` на классе `AppModule`.
3. Прочитать массив `imports: [...]` — это модули приложения.
4. Для каждого модуля **рекурсивно**:
   - Открыть файл модуля.
   - Прочитать `controllers: [...]` — это контроллеры этого модуля.
   - Прочитать `imports: [...]` — подмодули (опционально, на будущее, сейчас плоско достаточно).
5. Итог: упорядоченный массив `ControllerDeclaration[]`.

Преимущества:
- Порядок предсказуем (как в AppModule).
- Только зарегистрированные контроллеры (не подберёт stale `.controller.ts`).
- Глобальные модули (`AuthModule`, `DatabaseModule`) не дают «контроллеров», поэтому пропускаются естественно.

### Парсинг контроллера

Для каждого `ControllerDeclaration`:

```ts
@Controller('users')                    // path = 'users', version = undefined
export class UsersController {
    @Get('me')                          // method = GET, route = 'me'
    @UseGuards(AuthGuard)
    getMe(
        @CurrentUser() user: AuthenticatedUser,  // не HTTP-параметр, пропускаем
    ): Stored<User> { /* ... */ }       // returnType = Stored<User> (тип из @miracle/types)
}
```

Извлекаем:

- `controllerPath`: первый аргумент `@Controller(...)`. Строковый литерал или `{ path: '...' }`. Если объект — игнорировать `version` (он в Miracle не используется).
- Для каждого `public` (без `private`/`protected`) метода:
  - HTTP-декоратор из набора `@Get/@Post/@Put/@Patch/@Delete/@Options/@Head` (первый из них) → метод и путь.
  - Если HTTP-декоратора нет — это не endpoint, пропустить.
  - Параметры: только те, у которых есть `@Body`, `@Query`, или `@Param`. Остальные (`@CurrentUser`, `@Req`, `@Res`, `@Headers`, кастомные декораторы) — пропустить.

### Парсинг параметров

| Декоратор | Что делать |
|---|---|
| `@Body() dto: SomeDto` | Один body-аргумент с именем `dto` и типом `SomeDto`. |
| `@Body() dto: CreateOrderDto` | То же. Тип — это класс DTO. |
| `@Query() query: OrdersQueryDto` | Один query-аргумент-объект. |
| `@Query('userId') userId: string` | Field-режим query. Несколько таких → объединить в один объект `params: { userId, ... }` (см. mergeMultipleQueryFields). |
| `@Param('id') id: string` | Path-параметр. Имя в URL — первый аргумент декоратора (или имя параметра, если декоратор без аргумента). |
| `@Param() params: SomeParamsDto` | Один объект всех path-params (как DTO). |
| `@Req() / @Res() / @CurrentUser() / @Headers()` | Игнорировать. |

**Сигнатура клиентского метода** строится в порядке: path-params → query → body. Это то же правило, что в существующем миракловском [README.MD](../../tools/src/client-generator/README.MD).

### Извлечение типов

Развилка между «type printer» миракла и «ModelRegistry» старого генератора в новом проекте решается **за счёт архитектуры DTO**, а не за счёт умного резолва. Подробности — в [dto.md](./dto.md), здесь — следствия для генератора:

1. **Для типов из workspace-пакетов** (`@miracle/types`, `@miracle/aramid`, …) — type printer + нормализация `import("...")`. Эти типы импортируются на фронте напрямую как есть. Это покрывает все response-типы (`User`, `Order`, `Stored<Order>`, …).

2. **Для DTO-классов в `back-nest`** (`class XxxDto extends createZodDto(XxxSchema) {}`):
   - Найти `ClassDeclaration` для типа параметра.
   - Найти `extends createZodDto(<Identifier>)` — извлечь имя схемы (`<Identifier>`).
   - Проверить, что схема импортируется из `@miracle/types` (если нет — ошибка с указанием контроллера/метода: «DTO-схема должна жить в `@miracle/types/src/schemas/`», см. dto.md).
   - Эмитить в соответствующий `*.models.ts`:
     ```ts
     import type { z } from 'zod';
     import { XxxSchema } from '@miracle/types';
     export interface XxxDto extends z.infer<typeof XxxSchema> {}
     ```
   - **Никакого** type-printer'а полей, никакого BFS, никакого копирования схемы. Источник правды — schema в `@miracle/types`, и она доступна и бэку, и фронту через workspace-импорт.

3. **Для backend-local `type` / `interface` / `enum`** (не DTO-классы) — скопировать декларацию текстом, обернуть в `export` (как делает миракл в `getModelSourceText`). Используется редко: response-типы должны жить в `@miracle/types`, локальные алиасы появляются как исключение.

4. **Если тип используется в нескольких контроллерах** — вынести в `common.models.ts` (как миракл).

5. **Для внешних типов из `node_modules`** (не workspace) — `unknown` (с warning) либо ошибка при `strictTypes: true`.

### Раскладка вывода

Тот же layout, что у миракла — это уже работает с фронтовым кодом, и сохраняет одно простое правило «все модели лежат в `models/`»:

```
front/src/lib/generated/
  http.ts                       # formatPath helper
  index.ts                      # barrel: export * from './users.client', './orders.client', ...
  users.client.ts               # клиент конкретного контроллера
  orders.client.ts
  models/
    index.ts                    # barrel моделей (если кто-то импортит ./models)
    common.models.ts            # модели, используемые >1 контроллером
    users.models.ts             # модели, нужные только этому контроллеру (если есть)
    orders.models.ts
```

Все модели — внутри `models/`, без исключений. Per-controller и common — рядом, барель собирает соседей.

Имя файла `<controller>.client.ts` — это `<controllerBaseName>` в camelCase: `UsersController` → `users.client.ts`.

Имя экспортируемого объекта — `users` (camelCase basename без суффикса `Controller`).

### Формат сгенерированного клиента

```ts
// front/src/lib/generated/users.client.ts
/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { Stored, User } from '@miracle/types';
import { customInstance } from '../api';

export const users = {
    getMe: () => customInstance<Stored<User>>({
        method: 'GET',
        url: '/users/me',
    }),
};
```

Здесь нет ни `*.models.ts`, ни `formatPath`-импорта — у `getMe` нет ни DTO, ни path-params, а response (`Stored<User>`) живёт в `@miracle/types`. Импорт `formatPath` появится у первого маршрута с `@Param`, файл `*.models.ts` — у первого с DTO.

Для маршрутов с path-params:

```ts
getOrder: (params: { id: string }) => customInstance<Stored<Order>>({
    method: 'GET',
    url: formatPath('/orders/:id', params),
}),
```

Для маршрутов с body+query:

```ts
listOrders: (
    query: OrdersQueryDto,
) => customInstance<Stored<Order>[]>({
    method: 'GET',
    url: '/orders',
    params: query,
}),

createOrder: (
    createOrderDto: CreateOrderDto,
) => customInstance<Stored<Order>>({
    method: 'POST',
    url: '/orders',
    data: createOrderDto,
}),
```

Имя аргумента — camelCase от имени именованного типа (`CreateOrderDto` → `createOrderDto`), либо fallback `'body' | 'params' | 'query'` для inline-типов. Это правило **точно** как у миракла.

Соответствующий `orders.models.ts` для примера выше:

```ts
// front/src/lib/generated/models/orders.models.ts
/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import type { z } from 'zod';
import { CreateOrderSchema, OrdersQuerySchema } from '@miracle/types';

export interface CreateOrderDto extends z.infer<typeof CreateOrderSchema> {}
export interface OrdersQueryDto extends z.infer<typeof OrdersQuerySchema> {}
```

Никакого структурного дублирования полей: реальная форма — в схемах из `@miracle/types`. Если схема меняется — типы фронта обновляются автоматически через `z.infer`, генератор перезапускать **не обязательно** (хотя по конвенции прогон делается на каждое изменение бэка).

## Структура файлов нового генератора

```
tools/src/client-generator-nest/
  index.ts                      # entry-point: loadConfig → extract → write
  config.ts                     # loadConfig, findWorkspaceRoot, дефолты
  types.ts                      # типы AST-моделей (AppModel, ControllerModel, RouteModel, ...)
  extract.ts                    # main parsing: AppModule walk, controllers, методы, типы
  parse-decorators.ts           # утилиты для @Controller/@Get/@Body/@Query/@Param
  parse-params.ts               # mergeMultipleQueryFields + классификация параметров
  resolve-types.ts              # type printer + normalize import("...") + резолв DTO-классов через extends createZodDto(Schema)
  emit-client.ts                # генерация *.client.ts
  emit-models.ts                # генерация *.models.ts + common.models.ts
  emit-http.ts                  # генерация http.ts с formatPath
  emit-barrel.ts                # генерация index.ts
  naming.ts                     # toCamelCase, toPascalCase, stripSuffix (как у миракла)
  plugins/
    types.ts                    # GeneratorPlugin интерфейс (на будущее, пока пустой)
  README.md                     # короткая инструкция, как запустить (как у миракла)
```

Можно начать **меньше файлов** и разделять по мере роста. Минимум для первой рабочей версии: `index.ts`, `config.ts`, `types.ts`, `extract.ts`, `writers.ts`, `naming.ts`.

## Алгоритм генерации (пошагово)

```
1. loadConfig(configPath?)
   ├─ findWorkspaceRoot() — поднимаемся вверх до package.json с workspaces
   ├─ если configPath есть — dynamic import
   ├─ иначе — дефолт: { input: 'back-nest/src/app.module.ts',
   │                    output: 'front/src/lib/generated',
   │                    customInstance: 'front/src/lib/api' }
   └─ → NormalizedConfig

2. extractAppModel(config)
   ├─ project = new Project({ tsConfigFilePath: backNestTsConfig })
   ├─ appModuleFile = project.getSourceFileOrThrow(config.inputPath)
   ├─ appModuleClass = найти класс с @Module
   ├─ imports = прочитать массив imports из @Module(...)
   ├─ для каждого импортированного модуля:
   │  ├─ resolveVariableDeclaration → найти исходник модуля
   │  ├─ moduleClass = найти @Module
   │  ├─ controllers = прочитать массив controllers (если есть)
   │  └─ для каждого контроллера: extractController()
   └─ → AppModel { controllers: ControllerModel[], commonModels }

3. extractController(classDecl)
   ├─ @Controller(args) → path = args[0] (string или {path}.path), version игнорируем
   ├─ для каждого method класса:
   │  ├─ если private/protected → skip
   │  ├─ httpDecorator = первый из @Get/@Post/@Put/@Patch/@Delete
   │  ├─ если httpDecorator нет → skip
   │  ├─ pathParams, queryArgs, bodyArg, queryFields = parseParams(method)
   │  ├─ mergeMultipleQueryFields(queryArgs) если несколько @Query('...')
   │  ├─ returnType = unwrapPromise(method.getReturnType().getText())
   │  └─ → RouteModel
   └─ → ControllerModel { name, path, routes }

4. resolveTypes(appModel, project)
   ├─ для каждого RouteModel:
   │  ├─ normalizeImport("...") в типах → externalTypeImports
   │  ├─ для DTO-классов (extends createZodDto(<Schema>)):
   │  │  ├─ найти имя <Schema> в `extends` clause
   │  │  ├─ убедиться что Schema импортирована из @miracle/types
   │  │  └─ эмитить `interface <Dto> extends z.infer<typeof <Schema>> {}`
   │  └─ для backend-local type/interface/enum: copy text (редкий случай)
   ├─ типы из @miracle/types и других workspace-пакетов — без копирования
   ├─ типы из node_modules вне workspace — unknown (или throw при strictTypes)
   └─ → commonModels (использованные >1 раз) + per-router models

5. writeAll(appModel, config)
   ├─ rm -rf config.outputDir
   ├─ mkdir config.outputDir/models
   ├─ writeHttpHelper() → http.ts с formatPath
   ├─ writeCommonModels(appModel) → common.models.ts (если есть shared)
   ├─ для каждого ControllerModel:
   │  ├─ writeRouterModels() → <name>.models.ts (если есть локальные DTO)
   │  └─ writeRouterClient() → <name>.client.ts
   └─ writeBarrelFiles() → index.ts + models/index.ts
```

## Ключевые алгоритмические места

### 1. Чтение `controllers: [...]` из `@Module(...)`

В AppModule:
```ts
@Module({
    imports: [AppConfigModule, DatabaseModule, AuthModule, HealthModule, UsersModule],
})
export class AppModule {}
```

Имена в массиве `imports` — это `Identifier`-узлы. Чтобы добраться до файла модуля, нужно:
1. `classDecl.getDecorator('Module').getArguments()[0]` → `ObjectLiteralExpression`
2. Найти свойство `imports` → `ArrayLiteralExpression`
3. Для каждого `Identifier` элемента → `symbol.getDeclarations()[0].getSourceFile()` (это импорт). Либо проще — резолвить через `getImportDeclaration` исходного файла.

В каждом модуле:
```ts
@Module({
    controllers: [UsersController],
    providers: [UsersService],
})
export class UsersModule {}
```

Те же шаги — найти `controllers: [...]`, для каждого `Identifier` → `ClassDeclaration`.

Если модуль глобальный/пустой (без `controllers`) — пропустить.

### 2. Парсинг `@Param/@Query/@Body`

Старый генератор уже это умеет ([parse.ts:50](../../monitorium-dev/packages/client-generator/src/parse.ts)) — взять оттуда логику почти один-в-один. Адаптации:

- Заменить `paramKind` — добавить пропуск кастомных декораторов (`@CurrentUser`).
- Если декоратор имеет арг-литерал (`@Query('userId')`) — это field-режим.
- Если без арга (`@Body()`, `@Query()`) — object-режим.

### 3. Резолв DTO-класса через схему из `@miracle/types`

```ts
// back-nest/src/orders/dto/create-order.dto.ts
import { createZodDto } from 'nestjs-zod';
import { CreateOrderSchema } from '@miracle/types';

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}
```

Через `ts-morph` тип параметра `dto: CreateOrderDto` printer'ом даёт `"CreateOrderDto"`. Сам класс на фронт не уезжает (это runtime-сущность с zod-валидацией). Но **исходная схема живёт в `@miracle/types/src/schemas/`** (см. [dto.md](./dto.md)) и доступна и бэку, и фронту как обычный workspace-импорт.

Поэтому фронт получает тип через `z.infer` от той же схемы. Алгоритм:

1. Найти `ClassDeclaration` для `CreateOrderDto` (через `symbol.getDeclarations()` типа параметра).
2. Найти `extends`-выражение: `extends createZodDto(<expr>)`.
   - Если родитель не `createZodDto(...)` — это не DTO-класс по конвенции, fallback на обработку как обычный класс (warning + `unknown`, либо ошибка при `strictTypes`).
3. Из аргумента `createZodDto(<Identifier>)` извлечь имя схемы (`<Identifier>` — `CreateOrderSchema`).
   - Если аргумент — не идентификатор (inline-выражение `createZodDto(z.object({...}))`) — ошибка «inline schema is not supported, see dto.md».
4. Резолвить identifier: `symbol.getDeclarations()[0]` → должна быть переменная, объявленная в одном из файлов `@miracle/types/src/schemas/*.schemas.ts`.
   - Проверить, что итоговый импорт-путь — `@miracle/types` (а не глубокий `@miracle/types/dist/...`). Если не так — ошибка с подсказкой.
5. Эмитить в `*.models.ts`:
   ```ts
   import type { z } from 'zod';
   import { CreateOrderSchema } from '@miracle/types';

   export interface CreateOrderDto extends z.infer<typeof CreateOrderSchema> {}
   ```
   `interface … extends z.infer<typeof Schema> {}` (не `type … = z.infer<...>`) — потому что `interface` сохраняет имя в IDE-hover. Это то же правило, что описано в dto.md для ручного использования схем на фронте.

**Что НЕ делать:**

- Не разворачивать DTO в структуру через `type.getText()` или обход properties. Это утрачивает связь с runtime-схемой и порождает лишний код, который рассинхронизируется со схемой.
- Не копировать саму схему в `front/src/lib/generated/`. Источник правды — `@miracle/types`, фронт импортирует её напрямую.
- Не пытаться обрабатывать `extends createZodDto(InlineExpression)`. Такая конструкция запрещена соглашением (см. dto.md, шаг 1).

### 4. Нормализация `import("...")`

Скопировать `normalizeGeneratedTypeText` из [extract.ts:341](../../tools/src/client-generator/extract.ts:341) миракла — она уже работает.

### 5. `unwrapPromise`

Скопировать `unwrapPromise` из [ast-helpers.ts:54](../../monitorium-dev/packages/client-generator/src/ast-helpers.ts:54) старого. Nest-методы часто `async` → return type оборачивается в Promise.

### 6. Multiple `@Query('field')` → один объект

Скопировать `mergeMultipleQueryFields` из [parse.ts:116](../../monitorium-dev/packages/client-generator/src/parse.ts:116) старого. Полезно: на клиенте сигнатура остаётся плоской (`{ userId, isCompleted }`), но передаётся одним `params: {...}`.

### 7. Извлечение зависимостей для `common.models.ts`

Миракл уже это делает в [extract.ts:576](../../tools/src/client-generator/extract.ts:576) (`collectCommonModels`) — копировать логику. Тип попадает в `common.models.ts` если он:
- объявлен в backend (не в workspace-пакете);
- используется >1 контроллером;
- не входит в `@miracle/types`.

## Конфиг

По умолчанию **нет** конфиг-файла — генератор сам резолвит:

```ts
// дефолты (когда config-файла нет)
{
    input: '<workspaceRoot>/back-nest/src/app.module.ts',
    output: '<workspaceRoot>/front/src/lib/generated',
    customInstance: '<workspaceRoot>/front/src/lib/api',
    tsConfig: '<workspaceRoot>/back-nest/tsconfig.json',
}
```

Опциональный конфиг — `front/src/lib/client-generator-nest.config.ts`:

```ts
import type { ClientGeneratorNestConfig } from '@miracle/tools/client-generator-nest';

export default {
    input: '../../../back-nest/src/app.module.ts',
    output: './generated',
    customInstance: './api',
    // optional:
    // strictTypes: true,
    // builtinTypeNames: [...] (расширить дефолтные)
    // plugins: [...] (на будущее)
} satisfies ClientGeneratorNestConfig;
```

**`repoRoot` не передаётся** — генератор сам находит workspace-root через `findWorkspaceRoot`. Это явный отказ от старого подхода.

## Скрипт запуска

В `tools/package.json` добавить:

```json
{
    "scripts": {
        "generate:client-nest": "tsx src/client-generator-nest/index.ts"
    }
}
```

В корневом `package.json` (когда back-nest полностью заменит back):

```json
{
    "scripts": {
        "generate-client-nest": "npm run generate:client-nest --workspace=tools"
    }
}
```

Старый `generate:client` оставить пока работает старый `back`.

## Edge cases (граничные случаи)

Эти случаи **обязательно** обработать или явно зафейлить:

1. **Метод без HTTP-декоратора** в контроллере → пропустить.
2. **Контроллер без `@Controller(...)`** → пропустить.
3. **`@Controller()` без аргументов** → префикс пустая строка (`@Get('all')` даст URL `/all`).
4. **Возвращаемый тип не аннотирован** (TS-инференция) — использовать `method.getReturnType().getText()` (он работает и без аннотации).
5. **Тип параметра — `unknown` / `any`** — пропускать, эмитить `unknown`, warning в stdout.
6. **`@Query()` + `@Body()` одновременно** — оба попадают в клиентский метод.
7. **`@Query()` без аргумента + `@Query('field')` в одном методе** — конфликт, бросить ошибку с указанием контроллера/метода.
8. **DTO-класс импортирован из другого модуля** — резолвить через `getSymbol().getDeclarations()`, эмитить в моделях того модуля, где он первый раз встретился (либо в `common.models.ts` если используется в >1 контроллере). Импорт самой схемы из `@miracle/types` дедуплицируется в шапке файла.
11. **DTO-класс не наследуется от `createZodDto(...)`** — нарушение конвенции (см. dto.md). По умолчанию warning + `unknown`; при `strictTypes: true` — ошибка.
12. **DTO наследуется от `createZodDto(SomeSchema)`, но `SomeSchema` объявлена в самом back-nest** (а не в `@miracle/types`) — нарушение архитектуры (см. dto.md, правило 1). Ошибка с указанием контроллера/метода и подсказкой «перенеси схему в `@miracle/types/src/schemas/<domain>.schemas.ts`».
9. **`@miracle/types` импортируется через namespace** (`import * as Types from '@miracle/types'`) — не поддерживать в первой версии, бросить ошибку.
10. **Циклические зависимости модулей** — Nest позволяет через `forwardRef`. Не разворачивать — после обнаружения `forwardRef(() => SomeModule)` пропустить такой импорт с warning'ом (не критично для клиента).

## Verification

После того как генератор написан и `back-nest` имеет хотя бы один контроллер (на старте — `UsersController`):

1. **Сухой прогон без записи** (если реализуешь dry-mode):
   ```bash
   npm run generate:client-nest --workspace=tools -- --dry
   ```
   Выводит план: какие контроллеры найдены, какие методы, какие модели будут эмитированы. Ошибок нет.

2. **Полный прогон**:
   ```bash
   npm run generate:client-nest --workspace=tools
   ```
   В `front/src/lib/generated/` появляется:
   - `http.ts` с `formatPath`
   - `users.client.ts` с экспортом `users` объекта, содержащего метод `getMe`. Метод возвращает `Stored<User>`, импортируемый напрямую из `@miracle/types`.
   - `models/users.models.ts` **не создаётся** — у `UsersController` нет ни DTO, ни локальных типов (response — `Stored<User>` из `@miracle/types`). Файл с моделями появится у первого контроллера с `@Body`/`@Query`-DTO (например, `OrdersController`).
   - `index.ts` с `export * from './users.client'`
   - `models/index.ts` (barrel)

   После миграции `orders` (или `sessions`) в `back-nest` ожидается:
   - `models/orders.models.ts` с `interface CreateOrderDto extends z.infer<typeof CreateOrderSchema> {}` и `interface OrdersQueryDto extends z.infer<typeof OrdersQuerySchema> {}` (плюс импорт схем из `@miracle/types`).
   - `orders.client.ts` с методами, использующими эти interface'ы как типы аргументов (импорт через barrel `./models`).

3. **Компиляция фронта**:
   ```bash
   npm run build --workspace=front
   ```
   Должна пройти без ошибок типов в сгенерированных файлах.

4. **Эквивалентность старому генератору** (на роутерах, которые мигрировали): подняв `back-nest` и старый `back` параллельно, прогнать оба генератора. Сгенерированные клиенты для одинаковых роутов должны иметь **идентичную сигнатуру** (имена методов, типы аргументов, типы ответов, URL). Различия только в деталях форматирования.

5. **Smoke-test runtime'а**: дёрнуть из браузера/curl сгенерированный метод (например, `users.getMe()`) — он должен сделать запрос на тот же URL, который Nest замапил (`GET /users/me`).

## Что НЕ входит в первую версию

Намеренно отложено:

1. **Plugin-система**. Создать `plugins/types.ts` с интерфейсом, но без встроенных плагинов. Поле `plugins` в конфиге принимается, но игнорируется (с warning'ом, что не реализовано).
2. **OpenAPI emission**. Если позже понадобится — отдельный этап.
3. **Версионирование URL** (`@Controller({ version })`). Не используется в Miracle, бросать ошибку при обнаружении.
4. **`globalPrefix`**. Не используется, не учитывать.
5. **Кодген mutator'а**. Mutator пишется руками во `front/src/lib/api.ts`, как сейчас.
6. **CLI с флагами** (`--config`, `--dry`, ...). Принимать единственный позиционный аргумент — путь к конфигу (как делает миракловский).

## Связь с другими паттернами

При работе агенту полезно:

- **`controller.md`** — описывает паттерны декораторов, которые этот генератор должен распознать.
- **`dto.md`** — описывает архитектуру: схемы живут в `@miracle/types/src/schemas/`, DTO в back-nest — тонкая обёртка `class XxxDto extends createZodDto(XxxSchema) {}`. Генератор полагается на этот контракт: имя в `extends createZodDto(...)` обязано быть identifier'ом, импортированным из `@miracle/types`.
- **`module.md`** — описывает структуру модуля с `@Module({ controllers: [...] })`, которую генератор обходит.
- **`auth.md`** — `@CurrentUser` и `@Req`/`@Res` — параметры, которые генератор обязан игнорировать.

Если паттерны изменятся (например, добавится новый кастомный декоратор для авторизации) — генератор тоже надо обновить (добавить декоратор в blacklist параметров).

## Источники для копирования (точные пути)

### Из миракла (`tools/src/client-generator/`):

- `config.ts` целиком — `loadConfig`, `findWorkspaceRoot`, `findNearestFile`. Адаптировать дефолты под Nest.
- `naming.ts` целиком — без изменений.
- `extract.ts:341-411` — `normalizeGeneratedTypeText`, `resolvePackageModuleSpecifier`, `decodeImportPath`, `findPackageJson`. Без изменений.
- `extract.ts:432-456` — `collectExternalImportsFromSourceFile`. Без изменений.
- `extract.ts:498-560` — `getReturnExpressions`, `unwrapSatisfiesExpression`, `unwrapExpression`, `isErrCall`, `isRouteErrorType`. **`isErrCall` и `isRouteErrorType` не нужны** (в Nest нет `err.*` returns). Остальное — без изменений.
- `extract.ts:562-696` — `getModelSourceText`, `collectCommonModels`, `getReferencedLocalDeclarations`, `collectTypeNames`. Используется только для **редких** backend-local `type`/`interface`/`enum`. DTO-классы через этот код **не проходят** — у них отдельная ветка с эмиссией `interface … extends z.infer<typeof Schema> {}`.
- `writers.ts` целиком — структуру сохранить, поменять только парсинг роутов на парсинг контроллеров.
- `http.ts`-генерация из `writers.ts:29-46` — без изменений.

### Из старого (`<external>/packages/client-generator/`):

- `parse.ts:6-13` — `controllerBasename`, `toObjectName`. Без изменений.
- `parse.ts:15-46` — `parseControllerMeta`, `parseHttpDec`. Чуть упростить (выкинуть `version`).
- `parse.ts:48-113` — `paramKind`, `parseMethod`. Добавить пропуск кастомных декораторов; в остальном без изменений.
- `parse.ts:116-122` — `mergeMultipleQueryFields`. Без изменений.
- `ast-helpers.ts:54-67` — `unwrapPromise`. Без изменений.
- `config.ts:64-86` — `defaultBuiltinTypeNames`. Скопировать и при необходимости расширить под Miracle.

## TL;DR для агента

1. Создай `tools/src/client-generator-nest/` с базовым каркасом.
2. Возьми из миракла авто-конфиг, type printer, layout файлов, формат генерации.
3. Возьми из старого — парсинг Nest-декораторов и `unwrapPromise`/`mergeMultipleQueryFields`.
4. Замени **источник** правды: вместо `defineApp([...])` — обход `AppModule.imports → Module.controllers`.
5. Для DTO-классов — **не разворачивай структуру**. Найди `extends createZodDto(<Schema>)`, проверь что `<Schema>` импортирована из `@miracle/types`, и эмитируй `interface <Dto> extends z.infer<typeof <Schema>> {}`. Источник правды — schema в `@miracle/types`, она и так доступна фронту.
6. Не тяни plugin Prisma и `repoRoot` — Miracle живёт без этого.
7. Verification: `back-nest` имеет `UsersController` с одним методом `getMe` (без DTO) — на этом контроллере обкатывай happy path по response-стороне. Полную цепочку с DTO обкатывай на первом мигрированном контроллере с `@Body`/`@Query` (например, `OrdersController`).
