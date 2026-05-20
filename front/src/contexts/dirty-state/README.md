# dirty-state

Механизм отслеживания несохранённых изменений в полях и секциях с блокировкой навигации.

---

## Из чего состоит

| Файл | Назначение |
|---|---|
| `DirtyGuardContext.tsx` | Guard — регистрирует поля и секции, блокирует навигацию |
| `useField.tsx` | Поле — хранит собственный original/value, регистрируется в Guard |

---

## Ключевые идеи

**Поле — единица отслеживания.** `useField<T>(id, defaultValue)` хранит собственный `original` и `value`. Сравнение через `fast-deep-equal` — работает для примитивов, объектов, массивов, boolean.

**Guard — регистр участников.** `DirtyGuardProvider` хранит все зарегистрированные поля через единый интерфейс `EntryApi { commit, reset }`. Знает кто грязный, умеет закоммитить или сбросить всех.

**Вложенность для секций.** Вместо отдельного `DirtyProvider` — просто вложенный `<DirtyGuardProvider id="...">`. Он регистрируется в родительском Guard как секция с тем же интерфейсом `EntryApi`.

**Работает без Guard.** `useField` без `DirtyGuardProvider` в дереве работает автономно — отслеживает isDirty локально, commit/reset доступны напрямую.

---

## API

### `useField<T>(id, defaultValue)`

| Возвращает | Тип | Описание |
|---|---|---|
| `value` | `T` | Текущее значение |
| `isDirty` | `boolean` | Отличается ли от original |
| `onChange` | `(value: T) => void` | Для кастомных компонентов |
| `onInputChange` | `(e: ChangeEvent) => void` | Для нативных `<input>` / `<textarea>` |
| `commit` | `() => void` | value → original, isDirty → false |
| `reset` | `() => void` | value → original (отмена изменений) |

### `DirtyGuardProvider`

| Проп | Тип | По умолчанию | Описание |
|---|---|---|---|
| `id` | `string` | — | Регистрирует в родительском Guard как секцию |
| `confirmMessage` | `string` | `"Есть несохранённые..."` | Текст `window.confirm` |
| `skipBuiltinBlocker` | `boolean` | `false` | Отключить `window.confirm`, использовать `useGuardBlocker` |

### Хуки Guard

| Хук | Описание |
|---|---|
| `useGuardState()` | `{ isDirtyAnywhere, dirtyIds, dirtyCount, isDirty(id) }` |
| `useGuardActions()` | `{ commitAll(), resetAll() }` |
| `useGuardBlocker()` | Кастомный UI блокера (TanStack Router blocker) |

---

## Примеры

### Одно поле, без Guard

```tsx
function NameInput() {
    const field = useField<string>('name', '')
    return (
        <div>
            <input value={field.value} onChange={field.onInputChange} />
            {field.isDirty && <button onClick={field.reset}>Сбросить</button>}
        </div>
    )
}
```

### Форма с Guard и кнопкой сохранения

```tsx
function ProfilePage({ profile }) {
    return (
        <DirtyGuardProvider>
            <ProfileForm />
        </DirtyGuardProvider>
    )
}

function ProfileForm() {
    const nameField  = useField<string>('name', profile.name)
    const emailField = useField<string>('email', profile.email)
    const { isDirtyAnywhere } = useGuardState()
    const { commitAll } = useGuardActions()
    const { mutate } = useSaveMutation()

    const handleSave = () => mutate(
        { name: nameField.value, email: emailField.value },
        { onSuccess: commitAll }
    )

    return (
        <form>
            <input value={nameField.value}  onChange={nameField.onInputChange} />
            <input value={emailField.value} onChange={emailField.onInputChange} />
            <button disabled={!isDirtyAnywhere} onClick={handleSave}>Сохранить</button>
        </form>
    )
}
```

### Boolean и другие типы

```tsx
// Логическое значение — onChange, не onInputChange
const active = useField<boolean>('active', false)
<Switch checked={active.value} onCheckedChange={active.onChange} />

// Выпадающий список
const status = useField<'draft' | 'published'>('status', 'draft')
<Select value={status.value} onValueChange={status.onChange} />

// Объект — fast-deep-equal сравнивает глубоко
const address = useField<Address>('address', defaultAddress)
<AddressPicker value={address.value} onChange={address.onChange} />
```

### Секции через вложенные Guard

```tsx
function EditorPage({ meta, content }) {
    return (
        <DirtyGuardProvider>
            {/* Секция регистрируется в родительском Guard */}
            <DirtyGuardProvider id="meta">
                <MetaSection />
            </DirtyGuardProvider>

            <DirtyGuardProvider id="content">
                <ContentSection />
            </DirtyGuardProvider>

            <EditorToolbar />
        </DirtyGuardProvider>
    )
}

function EditorToolbar() {
    const { isDirtyAnywhere, isDirty } = useGuardState()
    const { commitAll } = useGuardActions()

    return (
        <div>
            {isDirty('meta') && <span>Мета изменена</span>}
            {isDirty('content') && <span>Контент изменён</span>}
            <button disabled={!isDirtyAnywhere} onClick={handleSaveAll}>
                Сохранить всё
            </button>
        </div>
    )
}
```

### Кастомный диалог блокировки

```tsx
<DirtyGuardProvider skipBuiltinBlocker>
    <MyPage />
    <NavigationGuard />
</DirtyGuardProvider>

function NavigationGuard() {
    const blocker = useGuardBlocker()
    if (blocker.status !== 'blocked') return null
    return (
        <Dialog open>
            <button onClick={blocker.proceed}>Покинуть</button>
            <button onClick={blocker.reset}>Остаться</button>
        </Dialog>
    )
}
```

---

## Связь с draft-api

`dirty-state` и `draft-api` решают разные задачи:

| | dirty-state | draft-api |
|---|---|---|
| Задача | Отслеживать изменения, блокировать навигацию | Собрать объект из секций для сохранения |
| Когда активен | Постоянно (реактивно) | Только в момент вызова `collect` |

В компоненте они используются вместе: `useField` отслеживает значение, `useContribute` передаёт `field.value` в черновик при сохранении.

```tsx
function TitleField() {
    const { contribute } = useDocumentCardContext()
    const field = useField<string>('title', doc.title)

    useContribute(contribute, 'title', (draft) => ({
        ...draft,
        title: field.value,
    }))

    return <input value={field.value} onChange={field.onInputChange} />
}
```
