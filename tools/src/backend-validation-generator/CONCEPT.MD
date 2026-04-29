# Route Validation — Концепт

> Это концепт. Конкретные имена файлов, экспортов и структура могут отличаться
> от реального проекта — адаптировать под факт.

---

## Цели

- Парсить `query` и `params` из строк в реальные типы (number, boolean, union-литералы)
- Кодген **не трогает пользовательские файлы** — только генерирует свои
- Пользователь объявляет намерение валидировать прямо в роуте/роутере
- Кодген читает это намерение, генерирует парсеры и связывает их с роутами через отдельный сгенерированный файл
- Парсер собирает **все** ошибки по всем полям и возвращает их разом через `err.validation`

---

## 1. Объявление намерения в роуте

Добавляем опцию `validate` в объектную форму роута. `query` и `params` —
раздельные флаги, т.к. часто нужно парсить только одно из двух.

```ts
export const getUsersRoute = route.get('/users', {
  validate: {
    query:  true,
    params: true,
  },
  handler({ query, params }: { query: GetUsersQuery, params: GetUserParams }) {
    // query.page — уже number в рантайме
  },
});
```

---

## 2. Наследование validate через роутер

Роутер может объявить `validate` как дефолт для всех своих роутов:

```ts
export const usersRouter = defineRouter('/users', {
  validate: {
    query:  true,
    params: true,
  },
  middlewares: [...],
  routes: [
    getUsersRoute,
    getUserByIdRoute,
  ],
});
```

**Логика наследования** — роут всегда может переопределить значение роутера:

```
роутер.validate.query  →  роут.validate.query  →  итог
──────────────────────────────────────────────────────
true                      не указано              true   (наследует)
true                      false                   false  (роут переопределяет)
true                      true                    true
не указано                true                    true   (роут явно указал)
не указано                не указано              false  (не валидировать)
```

Если в будущем появятся вложенные роутеры — та же логика: дочерний переопределяет
родительского, иначе наследует.

---

## 3. Инструмент генерации — отдельный пакет

Генератор валидаторов живёт как **отдельный CLI-инструмент** в своём пакете,
независимо от генератора клиентских функций.

### Конфигурация

Инструмент принимает путь к конфиг-файлу аргументом запуска — аналогично тому,
как работает генератор клиента:

```bash
ts-node packages/codegen-validators/src/index.ts --config ./back/codegen.validators.ts
```

Конфиг-файл — TypeScript-файл рядом с папкой `generated` бэкенда:

```ts
// back/codegen.validators.ts

import type { ValidatorsConfig } from 'codegen-validators';

export default {
  // Откуда читать роуты и роутеры
  routesGlob:  './src/routes/**/*.ts',
  routersGlob: './src/routers/**/*.ts',

  // Куда писать сгенерированные файлы
  outDir: './src/generated',

  // tsconfig для ts-morph
  tsConfigFilePath: './tsconfig.json',
} satisfies ValidatorsConfig;
```

### Вывод в консоль

Инструмент логирует прогресс пошагово:

```
[codegen-validators] Reading config: ./back/codegen.validators.ts
[codegen-validators] Loading project from tsconfig...
[codegen-validators] Scanning routes: 12 files found
[codegen-validators] Processing getUsersRoute        → query ✓
[codegen-validators] Processing getUserByIdRoute     → params ✓
[codegen-validators] Processing createOrderRoute     → body skipped (not supported)
[codegen-validators] ⚠ Collision: GET /users/export — same key as GET /users/:id, check route paths
[codegen-validators] Writing parsers.generated.ts
[codegen-validators] Writing validation-map.generated.ts
[codegen-validators] Done. 2 parsers generated, 1 warning.
```

---

## 4. Что генерируется

```
src/generated/
  parsers.generated.ts         ← функции-парсеры
  validation-map.generated.ts  ← маппинг "METHOD /path" → парсеры
```

### `parsers.generated.ts`

Каждый парсер сначала проходит по **всем полям**, собирает все ошибки,
и только потом — если ошибки есть — бросает `ParseError` со всем списком разом:

```ts
// GENERATED — не редактировать вручную

import { ParseError } from '../routing/parse-error.js';

export function parseGetUsersRouteQuery(raw: Record<string, unknown>) {
  const errors: Array<{ field: string; message: string }> = [];

  let page: number | undefined;
  if (raw.page !== undefined) {
    const parsed = Number(raw.page);
    if (isNaN(parsed)) errors.push({ field: 'page', message: 'expected number' });
    else page = parsed;
  }

  let limit: number | undefined;
  if (raw.limit !== undefined) {
    const parsed = Number(raw.limit);
    if (isNaN(parsed)) errors.push({ field: 'limit', message: 'expected number' });
    else limit = parsed;
  }

  let active: boolean | undefined;
  if (raw.active !== undefined) {
    if (raw.active !== 'true' && raw.active !== 'false') {
      errors.push({ field: 'active', message: 'expected boolean' });
    } else {
      active = raw.active === 'true';
    }
  }

  let role: 'admin' | 'user' | undefined;
  if (raw.role !== undefined) {
    if (!['admin', 'user'].includes(raw.role as string)) {
      errors.push({ field: 'role', message: 'expected one of: admin, user' });
    } else {
      role = raw.role as 'admin' | 'user';
    }
  }

  if (errors.length > 0) throw new ParseError(errors);

  return { page, limit, active, role };
}

export function parseGetUserByIdRouteParams(raw: Record<string, unknown>) {
  const errors: Array<{ field: string; message: string }> = [];

  const id = Number(raw.id);
  if (isNaN(id)) errors.push({ field: 'id', message: 'expected number' });

  if (errors.length > 0) throw new ParseError(errors);

  return { id };
}
```

### `validation-map.generated.ts`

Ключ — строка `"METHOD /full/path"`. Если кодген обнаружил коллизию —
выводит предупреждение в консоль и берёт последний найденный роут:

```ts
// GENERATED — не редактировать вручную

import {
  parseGetUsersRouteQuery,
  parseGetUserByIdRouteParams,
} from './parsers.generated.js';

export const validationMap: Record<string, {
  query?:  (raw: Record<string, unknown>) => unknown;
  params?: (raw: Record<string, unknown>) => unknown;
}> = {
  'GET /users':     { query:  parseGetUsersRouteQuery },
  'GET /users/:id': { params: parseGetUserByIdRouteParams },
};
```

---

## 5. ParseError — рядом с роутингом

`ParseError` живёт в пакете роутинга, рядом с `err`, `mw`, `route`:

```ts
// src/routing/parse-error.ts

export type ParseFieldError = {
  field:   string;
  message: string;
};

export class ParseError extends Error {
  constructor(public readonly errors: ParseFieldError[]) {
    super('Validation failed');
  }
}
```

---

## 6. Как `registerApp` использует карту

```ts
import { validationMap } from '../generated/validation-map.generated.js';
import { ParseError }    from './parse-error.js';

// Внутри обработки роута, перед вызовом хендлера:
const key        = `${route.method.toUpperCase()} ${router.prefix}${route.path}`;
const validators = validationMap[key];

try {
  const parsedQuery  = validators?.query  ? validators.query(req.query)   : req.query;
  const parsedParams = validators?.params ? validators.params(req.params) : req.params;

  // передаём дальше в хендлер
} catch (e) {
  if (e instanceof ParseError) {
    return err.validation('Validation failed', { details: e.errors });
  }
  throw e;
}
```

`registerApp` импортирует только сгенерированный файл — пользовательский код
не меняется.

---

## 7. Что кодген пропускает

| Ситуация | Поведение |
|---|---|
| `validate` не указан ни на роуте, ни на роутере | Роут не попадает в `validationMap` |
| Тип `query` / `params` — `unknown` (не аннотирован) | ⚠ предупреждение, роут пропускается |
| Вложенный объект в query | ⚠ предупреждение, поле пропускается |
| Union не-литеральных типов (`string \| number`) | ⚠ предупреждение, поле пропускается |
| Коллизия ключей `METHOD /path` | ⚠ предупреждение, берётся последний |
| Дженерики | Резолвятся через `getApparentType()`; если не резолвятся — ⚠ и пропуск |

---

## 8. Интеграция в сборку

Генератор валидаторов запускается отдельно от генератора клиента:

```jsonc
// back/package.json
{
  "scripts": {
    "codegen:validators":       "ts-node ../../packages/codegen-validators/src/index.ts --config ./codegen.validators.ts",
    "codegen:validators:watch": "nodemon --watch src/routes --watch src/routers --exec npm run codegen:validators",
    "build":                    "npm run codegen:validators && tsc"
  }
}
```

---

## 9. README инструмента

Пакет `codegen-validators` должен содержать `README.md` со следующими разделами:

- **Что это** — краткое описание назначения
- **Установка** — как добавить пакет в проект
- **Быстрый старт** — минимальный рабочий пример от конфига до запуска
- **Конфиг-файл** — все поля `ValidatorsConfig` с типами и дефолтами
- **Флаг `validate` в роуте и роутере** — как объявлять, логика наследования
- **Что генерируется** — структура файлов, примеры содержимого
- **Обработка ошибок** — что возвращает `err.validation`, формат `details`
- **Ограничения** — какие типы не поддерживаются и почему
- **Запуск и интеграция в сборку** — примеры скриптов для `package.json`
- **Предупреждения и коллизии** — как читать консольный вывод

---

## 10. Открытые вопросы

1. **Имя конфиг-файла** — `codegen.validators.ts` или унифицировать с именованием
   конфига генератора клиента? (ОТВЕТ: validation-generator.config.ts)

2. **`err.validation`** — нужно ли заводить отдельный хелпер или использовать
   существующий `err.badRequest` с `details`? Зависит от того, есть ли уже
   `err.validation` в роутинге. (ОТВЕТ: err.validation уже существует)

3. **Ключ коллизии** — учитывать ли префикс роутера при построении ключа на этапе
   кодгена, или доверять что роутер-файл содержит полный путь? Нужно уточнить,
   как роутер экспортирует информацию о префиксе. (ОТВЕТ: не понял суть вопроса. На усмотрение агенту, который будет исполнять план-концепт)