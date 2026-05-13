# DB: принципы и типы

Этот документ описывает, как сейчас работает локальная JSON-база в проекте, и чем отличаются типы `Stored<T>` и `StoredEntity<T>`.

## Как работает DB сейчас

В проекте используется `lowdb` с JSON-файлами. Каждая коллекция хранится в отдельном файле внутри директории `data` (или в `DB_DIR`, если переменная окружения задана).

Основные принципы:

- Источник данных для коллекции: `items: StoredEntity<TItem>[]`.
- При создании записи база всегда добавляет/обновляет служебные поля:
  - `id`
  - `createdAt`
  - `updatedAt`
- При обновлении записи база всегда обновляет `updatedAt`.
- Чтение (`list`, `getById`, `create`, `update`) возвращает `structuredClone(...)`, чтобы внешний код не мутировал внутренний state коллекции напрямую.
- Мягкое удаление: `softDelete(id, true)` — помечает запись (`deletedAt = now`), `softDelete(id, false)` — снимает метку (`deletedAt = null`). В обоих случаях обновляется `updatedAt`. Запись при этом остаётся в `items`.
- Жёсткое удаление: `delete(id)` физически удаляет запись из `items`.

## Модель служебных полей

Служебные поля описаны типом:

```ts
type DbEntity = {
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null;
};
```

Это обязательная "базовая надстройка" поверх доменной модели.

`deletedAt` — поле мягкого удаления: `undefined` — никогда не трогалось, `null` — метка снята, `number` — Unix-timestamp момента пометки.

## Поток данных в коллекции

### create

1. Принимается `CreateEntityInput<TItem>`.
2. Формируется объект с `id` (из input или `randomUUID()`).
3. `createdAt` и `updatedAt` выставляются middleware в текущее время.
4. Объект сохраняется в `items`.
5. Снаружи возвращается клон сохраненной сущности.

### update

1. Ищется запись по `id`.
2. Patch **глубоко мержится** в запись через `ts-deepmerge` (см. раздел ниже).
3. Middleware обновляет `updatedAt`.
4. Данные сохраняются.
5. Возвращается клон обновленной сущности (или `undefined`, если запись не найдена).

> `deletedAt` намеренно исключён из `UpdateEntityInput` — управляй им через `softDelete`.

### softDelete

1. Ищется запись по `id`.
2. Middleware (`beforeSoftDelete`) выставляет `deletedAt = mark ? Date.now() : null` и обновляет `updatedAt`.
3. Данные сохраняются.
4. Возвращается клон обновленной сущности (или `undefined`, если запись не найдена).

### delete

1. Ищется индекс записи по `id`.
2. Запись физически удаляется из `items` через `splice`.
3. Данные сохраняются.
4. Возвращается `true` (удалено) или `false` (не найдено).

## Разница между `Stored<T>` и `StoredEntity<T>`

Текущие определения по смыслу:

```ts
type Stored<T extends object> = T & DbEntity;
type StoredEntity<T extends object> = Omit<T, keyof DbEntity> & DbEntity;
```

### Когда они одинаковы

Если в `T` нет `id`, `createdAt`, `updatedAt`, результат одинаковый:

```ts
type FileModel = { name: string; size: number };

type A = Stored<FileModel>;
type B = StoredEntity<FileModel>;
// Оба: { name: string; size: number; id: string; createdAt: number; updatedAt: number }
```

### Когда они отличаются

Если в `T` есть одноименные поля с несовместимым типом:

```ts
type BadModel = { name: string; createdAt: string };

type A = Stored<BadModel>;
// createdAt: string & number (по сути проблемный тип)

type B = StoredEntity<BadModel>;
// createdAt: number (string-версия вырезана через Omit)
```

## Что использовать и где

- Для backend-коллекций лучше использовать `StoredEntity<T>`: это защита от случайных конфликтов типов в доменной модели.
- Для shared/frontend-контракта допустимо использовать `Stored<T>`: он проще читается и удобен для описания "модель + мета БД" в API-ответах.

## Deep merge при update (ts-deepmerge)

`update()` использует `ts-deepmerge` вместо `Object.assign`, что позволяет передавать только изменённую ветвь объекта — остальные поля не затрагиваются.

### Зачем это нужно

Вложенные объекты (`meta`, настройки, статусы) часто обновляются разными подсистемами независимо. С `Object.assign` патч `{ meta: { extractionStatus: 'done' } }` затирал бы весь объект `meta`. Теперь он точечно обновляет только `extractionStatus`, не трогая остальные поля `meta`.

### Пример

```ts
// Состояние в базе:
// { id: '1', meta: { extractionStatus: 'pending', extractionType: 'ocr' } }

await collection.update('1', {
    meta: { extractionStatus: 'done' }
});

// Результат:
// { id: '1', meta: { extractionStatus: 'done', extractionType: 'ocr' } }
//                                                ^^^^^^^^^^^^^^^^^^^^ сохранено
```

### Поведение с массивами

`ts-deepmerge` по умолчанию **заменяет** массивы целиком (не мержит по индексам). Это правильное поведение для DB-патчей — если нужно обновить список, передаётся новый список.

```ts
// { tags: ['a', 'b'] }
await collection.update('1', { tags: ['c'] });
// { tags: ['c'] }  — не ['a', 'b', 'c']
```

### Важно: не используй Object.assign для патчей коллекций

Если внешний код вручную строит патч через `Object.assign`, он может случайно собрать плоский объект с полным вложенным деревом — тогда защита deep merge не поможет. Всегда передавай в `update()` только **изменённую часть** объекта.

## Middleware

`CollectionMiddleware<TItem>` — хук-интерфейс для коллекции:

| Хук | Когда вызывается | Параметры |
|---|---|---|
| `beforeCreate` | перед добавлением новой записи | `item` |
| `beforeUpdate` | перед сохранением патча | `item`, `patch` |
| `beforeSoftDelete` | перед мягким удалением/восстановлением | `item`, `mark: boolean` |

Встроенный `timestampsMiddleware` реализует все три хука и управляет `createdAt`, `updatedAt`, `deletedAt`.

Кастомные middleware передаются в `JsonCollection.create(name, [...middlewares])` и выполняются **после** `timestampsMiddleware`.

## Важно про runtime

Разница между `Stored<T>` и `StoredEntity<T>` — только в типовой безопасности TypeScript.

В рантайме:

- поля `createdAt`, `updatedAt` и `deletedAt` реально присутствуют в данных;
- база сама ими управляет через middleware;
- если вы их только читаете на фронте, конфликтов не возникает.

