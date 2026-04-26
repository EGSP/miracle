# Генератор клиента

Генерирует типизированные frontend-клиенты из backend-контракта typed-routing.

Генератор читает корневой `defineApp([...])`, резолвит роутеры верхнего уровня из
`back/src/routers`, извлекает метаданные маршрутов через `ts-morph` и записывает
клиенты в `front/src/lib/generated`.

## Runtime-контракт

Сгенерированные функции используют Orval-style custom instance:

```ts
customInstance<T>(config): Promise<T>
```

Frontend сам определяет эту функцию, обычно в `front/src/lib/api.ts`. Так axios
interceptors, base URL, auth headers и обработка ошибок остаются ручным кодом.

## Конфиг

Путь к конфигу по умолчанию:

```txt
front/src/lib/client-generator.config.ts
```

Пример:

```ts
export default {
    input: '../../../back/src/index.ts',
    output: './generated',
    customInstance: './api',
};
```

Все пути резолвятся относительно файла конфига.

## Сгенерированные файлы

Для backend-роутера `health.router.ts` генератор пишет:

```txt
front/src/lib/generated/health.client.ts
front/src/lib/generated/models/health.models.ts
```

Клиент экспортируется одним объектом на роутер:

```ts
import { health } from '@/lib/generated';

const result = await health.checkHealth();
```

## Требования к backend

- `back/src/index.ts` содержит один `defineApp([...])`.
- Массив app содержит переменные роутеров верхнего уровня.
- Роутеры создаются через `defineRouter(prefix, [...routes])`.
- Маршруты создаются через `route.get/post/put/patch/delete(path, handler)`.
- Массивы роутеров и маршрутов должны быть литералами.
- Пути должны быть строковыми литералами.
- Имена route-переменных становятся именами методов клиента.
- Типизированные API-ошибки нужно возвращать через `err[...]`; `throw` считается неожиданной серверной ошибкой.

## Модели

Генератор пишет модели в `generated/models`. Локальные `type` и `interface` из
файла роутера копируются в соответствующий файл моделей. Если response уже
является именованным типом, например `HealthResponse`, клиент использует его
напрямую и не создает лишний alias вроде `CheckHealthResponse`.

Общие backend-local типы, которые роутеры импортируют из относительных backend-файлов,
попадают в `generated/models/common.models.ts`. Генератор рекурсивно подтягивает
их зависимости, если эти зависимости тоже объявлены в backend-local файлах.

Типы из общих пакетов, например `@miracle/types`, не копируются. Файлы моделей
сохраняют import и добавляют type re-export, чтобы client-файлы могли импортировать
все публичные типы из `./models`.

Клиенты всегда импортируют модели из barrel-файла:

```ts
import type { HealthResponse, UserDto } from './models';
```

Это скрывает от клиентского кода, где именно лежит модель: в router-specific
файле, `common.models.ts` или общем workspace-пакете.

## CLI

```bash
npm run generate:client --workspace=tools
```

Можно передать путь к конфигу:

```bash
npm run generate:client --workspace=tools -- ../front/src/lib/client-generator.config.ts
```
