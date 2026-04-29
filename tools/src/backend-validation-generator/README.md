# Генератор backend-валидации

Генерирует runtime-парсеры для `query` и `params`, которые используются в кастомном backend-роутинге.

## Быстрый старт

Создайте `back/validation-generator.config.ts`:

```ts
import type { BackendValidationGeneratorConfig } from '@miracle/tools';

export default {
    input: './src/index.ts',
    output: './src/app/generated',
    tsConfig: './tsconfig.json',
} satisfies BackendValidationGeneratorConfig;
```

Включите валидацию на роуте или роутере:

```ts
const getUser = route.get('/user/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: number } }) => {
        return params.id;
    },
});
```

Запустите генерацию:

```bash
npm run generate-backend-validation
```

## Конфиг

- `input`: входной backend-файл, где вызывается `defineApp([...])`.
- `output`: папка для сгенерированных файлов. В этом проекте используется `./src/app/generated`.
- `tsConfig`: опциональный путь к backend `tsconfig.json`; если не указан, берется ближайший `tsconfig.json`.

## Флаг `validate`

`validate` можно объявить на роутере или на конкретном роуте:

```ts
defineRouter('/users', {
    validate: { query: true, params: true },
    routes: [getUsers, getUser],
});
```

Значения на роуте переопределяют значения роутера. Если `query` или `params` не включены ни на одном уровне, генератор их пропускает.

## Что генерируется

- `parsers.generated.ts`: функции-парсеры, которые сначала собирают все ошибки полей, а потом бросают `ParseError`.
- `validation-map.generated.ts`: карта `METHOD /full/path` → функции-парсеры.

`registerApp` импортирует `validationMap`, берет валидаторы по ключу текущего роута и передает в handler уже распарсенные `query` и `params`.

## Поддерживаемые типы

Поддерживаются поля типов `string`, `number`, `boolean` и union литералов, например `'active' | 'archived'`.
Вложенные объекты, массивы, нерезолвящийся `unknown` и union не-литеральных типов пропускаются с предупреждением.

## Ошибки

Ошибки парсинга превращаются в `err.validation('Validation failed', { details })` внутри `registerApp`.
