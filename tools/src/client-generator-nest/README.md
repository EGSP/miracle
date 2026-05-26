# client-generator-nest

Генератор HTTP-клиента для `back-nest` (NestJS). Обходит граф `AppModule`, читает контроллеры через `ts-morph`, эмитит типизированные клиенты в `front/src/lib/generated/`.

Концептуальный документ — `.agents/plans/nest-migration/client-generator.md`. Этот README — краткая практическая инструкция.

## Запуск

```bash
npm run generate:client-nest --workspace=tools
```

Без аргументов — генератор работает по конвенции:

| Параметр | Дефолт |
|---|---|
| `input` | `<workspaceRoot>/back-nest/src/app.module.ts` |
| `output` | `<workspaceRoot>/front/src/lib/generated` |
| `customInstance` | `<workspaceRoot>/front/src/lib/api` |
| `tsConfig` | `<workspaceRoot>/back-nest/tsconfig.json` |

С опциональным конфиг-файлом (`front/src/lib/client-generator-nest.config.ts`):

```ts
import type { ClientGeneratorNestConfig } from '@miracle/tools/client-generator-nest';

export default {
    input: '../../../back-nest/src/app.module.ts',
    output: './generated',
    customInstance: './api',
    // strictTypes: true,
    // builtinTypeNames: ['MyExtra'],
} satisfies ClientGeneratorNestConfig;
```

Все пути в конфиге резолвятся относительно файла конфига.

## Важно: разделение выхода со старым `client-generator`

Дефолтный `output` нового и старого генераторов **совпадает** (`front/src/lib/generated`). Это сознательное решение — фронт во время миграции работает либо со старым `back` (тогда запускаем `generate:client`), либо с `back-nest` (тогда `generate:client-nest`). Запуск каждого генератора начинается с `rm -rf` каталога `output`, то есть запуск одного **полностью затирает** результат другого.

Практически:

- Пока миграция не завершена и фронт «дёргает» старый `back` — после каждого изменения в `back/` запускайте старый `generate:client`. Новый запускайте только локально, чтобы проверить выход на `back-nest`.
- После cutover на `back-nest` — старый генератор больше не нужен.

Если нужно держать оба клиента бок о бок (например, фронт временно работает с `back`, а ты хочешь иметь `nest`-клиент для дев-юзкейса), переопредели `output` в конфиге нового генератора:

```ts
export default {
    output: './generated-nest',
} satisfies ClientGeneratorNestConfig;
```

## Что делает

1. Открывает `app.module.ts`, находит класс с декоратором `@Module`.
2. Из массива `imports` обходит верхнеуровневые модули, в каждом читает `controllers: [...]`.
3. Для каждого контроллера:
   - читает префикс из `@Controller(...)` (поддерживается `@Controller('path')` и `@Controller({ path: '...' })`, `version` запрещён);
   - для каждого `public`-метода ищет первый HTTP-декоратор (`@Get/@Post/@Put/@Patch/@Delete/@Options/@Head`);
   - разбирает параметры: `@Body`, `@Query()`, `@Query('field')`, `@Param('id')`, `@Param()`. Всё остальное (`@Req`, `@Res`, `@Headers`, `@CurrentUser`, кастомные декораторы) — игнорируется;
   - извлекает тип ответа: синтаксический `getReturnTypeNode()` если есть, иначе TS-инференция; снимает `Promise<>`.
4. Эмитит файлы в `output`:
   - `<controller>.client.ts` — объект-клиент с методами. Импорты локальных типов идут через barrel `./models`.
   - `models/<controller>.models.ts` — только если у контроллера есть DTO, локальные `type`/`interface`/`enum` или inline response-aliases. Иначе файл не создаётся.
   - `models/common.models.ts` — типы, которые делят 2+ контроллера, импортированные из workspace-backend (не из `@miracle/types`).
   - `models/index.ts` — barrel моделей (`export * from './common.models'`, `export * from './<x>.models'`).
   - `index.ts` — barrel клиентов.
   - `http.ts` — `formatPath` хелпер.

Все модели лежат в `models/` единообразно — никаких файлов-моделей на верхнем уровне.

## DTO: ключевое отличие от старого генератора

DTO-классы (`class XxxDto extends createZodDto(XxxSchema) {}`) **не разворачиваются** в структуру. Генератор находит `extends createZodDto(<Identifier>)`, проверяет, что схема импортируется из `@miracle/types`, и эмитит на фронт:

```ts
import type { z } from 'zod';
import { CreateOrderSchema } from '@miracle/types';
export interface CreateOrderDto extends z.infer<typeof CreateOrderSchema> {}
```

Источник правды формы — схема в `@miracle/types`. Это покрывается документом `.agents/plans/nest-migration/dto.md`.

## `strictTypes`

По умолчанию `false`. Если включить — генератор падает в случаях:

- DTO-класс наследует `createZodDto(...)`, но схема импортирована не из `@miracle/types`.
- DTO-класс наследует `createZodDto(<inline expression>)` (inline-схема не поддерживается).
- DTO-класс не наследует `createZodDto(...)` вообще (warning по умолчанию).

Без `strictTypes` те же ситуации печатают warning и тип резолвится как `unknown` / без DTO-резолва.

## Что НЕ поддерживается

Соответствует фазе текущей миграции (см. `client-generator.md`):

- `@Controller({ version })` — бросаем ошибку.
- `setGlobalPrefix(...)` — не учитывается, URL = `prefix + path`.
- Plugin-система — реализована как тип-заглушка, runtime-плагины пока не вызываются.
- Multipart / file upload — отдельная фаза.
- OpenAPI / Swagger — не генерируется.
- Кодген mutator'а — пишется руками во `front/src/lib/api.ts`.

## Структура пакета

```
tools/src/client-generator-nest/
  index.ts            # entry-point (generateClientNest)
  config.ts           # loadConfig + findWorkspaceRoot + дефолты
  types.ts            # AST-модели (AppModel, ControllerModel, RouteModel, ...)
  extract.ts          # AppModule walk + controller/route extraction + common models
  parse-params.ts     # @Body/@Query/@Param + merge multiple @Query('field')
  resolve-types.ts    # type printer + normalize import("...") + резолв DTO через createZodDto
  writers.ts          # эмиссия client/models/common/http/barrel
  naming.ts           # toCamelCase, toPascalCase, controllerBasename
```

Точечный CLI-entry — `tools/src/generate-client-nest.ts` (для npm-script).
