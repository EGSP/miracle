# dirty-state

Утилита для отслеживания несохранённых изменений внутри одной секции или формы.

Построена на паттерне **Context + Zustand `createStore`**: каждый `<DirtyProvider>` создаёт изолированный стор, который живёт внутри React-дерева и не виден снаружи. Если провайдер находится внутри `<DirtyGuardProvider>` и имеет prop `id` — он автоматически сообщает гварду о своём состоянии.

---

## Концепция

Стор хранит два объекта:

- `original` — исходный объект, эталон (то, что пришло с сервера)
- `workingCopy` — рабочая копия, которую редактирует пользователь

При каждом изменении поля стор пересчитывает `dirtyFields` — набор ключей, которые отличаются. `isDirty: true` когда `dirtyFields.size > 0`.

```
original:     { title: "Привет", status: "draft" }
workingCopy:  { title: "Новый заголовок", status: "draft" }

isDirty:      true
dirtyFields:  Set { "title" }
```

После сохранения вызывается `commit()` — `workingCopy` становится новым `original`, стор чистый.

---

## API

### `<DirtyProvider initial id? reinitializeOnChange?>`

Оборачивает секцию или форму. Создаёт изолированный стор.

| Проп | Тип | По умолчанию | Описание |
|---|---|---|---|
| `initial` | `T` | — | Исходный объект — эталон для сравнения |
| `id` | `string` | — | Идентификатор для регистрации в `<DirtyGuardProvider>` |
| `reinitializeOnChange` | `boolean` | `false` | Вызывать `initialize(initial)` при каждом изменении пропа |

> Стор создаётся один раз при монтировании. Изменение `initial` после монтирования не влияет — используй `initialize()` или `reinitializeOnChange`.

> `reinitializeOnChange` сбросит `workingCopy` даже если пользователь что-то редактирует. Используй только когда смена `initial` означает переключение сущности (например, выбрали другой документ).

---

### `useDirtyStore<T, R>(selector)`

Доступ к стору через selector. Подписывается только на выбранный кусок — нет лишних ре-рендеров.

Zustand-экшены (`commit`, `reset`, `initialize`, `updateField`) стабильны — их можно запрашивать через selector без опасений.

```tsx
// Читать флаг — компонент ре-рендерится только при смене isDirty
const isDirty = useDirtyStore<Profile, boolean>(s => s.isDirty)

// Читать экшены — стабильны, ре-рендер не вызовут
const commit = useDirtyStore<Profile, () => void>(s => s.commit)
const reset  = useDirtyStore<Profile, () => void>(s => s.reset)

// Читать рабочую копию
const copy = useDirtyStore<Profile, Profile>(s => s.workingCopy)

// Читать список изменённых полей
const dirtyFields = useDirtyStore<Profile, Set<keyof Profile>>(s => s.dirtyFields)
```

---

### `useDirtyStoreApi<T>()`

Доступ к сырому `StoreApi` без реактивной подписки. Используй в обработчиках сохранения — компонент не будет ре-рендериться при каждом нажатии клавиши.

```tsx
const storeApi = useDirtyStoreApi<Profile>()

const handleSave = async () => {
    const { workingCopy, commit } = storeApi.getState()
    await api.saveProfile(workingCopy)
    commit()
}
```

---

### `useField<T, K>(key)`

Привязка одного поля к компоненту. Подписывается **только на это поле** — смена других полей не вызывает ре-рендер.

| Возвращает | Тип | Описание |
|---|---|---|
| `value` | `T[K]` | Текущее значение из `workingCopy` |
| `isDirty` | `boolean` | Изменилось ли это поле |
| `onChange` | `(value: T[K]) => void` | Для кастомных компонентов — принимает значение напрямую |
| `onInputChange` | `(e: ChangeEvent) => void` | Для нативных `<input>` / `<textarea>` |

**Нативные компоненты — `onInputChange`:**

```tsx
function TitleField() {
    const field = useField<BlogPost, 'title'>('title')

    return (
        <div>
            <label>
                Заголовок
                {field.isDirty && <span>*</span>}
            </label>
            <input value={field.value} onChange={field.onInputChange} />
        </div>
    )
}

function BodyField() {
    const field = useField<BlogPost, 'body'>('body')
    return <textarea value={field.value} onChange={field.onInputChange} />
}
```

**Кастомные компоненты — `onChange`:**

```tsx
// Select — передаёт строку напрямую
function StatusField() {
    const field = useField<BlogPost, 'status'>('status')
    return (
        <Select value={field.value} onValueChange={field.onChange}>
            <SelectItem value="draft">Черновик</SelectItem>
            <SelectItem value="published">Опубликован</SelectItem>
        </Select>
    )
}

// DatePicker — передаёт Date напрямую
function PublishDateField() {
    const field = useField<BlogPost, 'publishDate'>('publishDate')
    return <DatePicker value={field.value} onChange={field.onChange} />
}

// Switch — передаёт boolean напрямую
function FeaturedField() {
    const field = useField<BlogPost, 'featured'>('featured')
    return <Switch checked={field.value} onCheckedChange={field.onChange} />
}
```

---

## Примеры

### Простая форма

```tsx
type UserProfile = {
    name: string
    email: string
    bio: string
}

function ProfilePage({ profile }: { profile: UserProfile }) {
    return (
        <DirtyProvider<UserProfile> initial={profile}>
            <ProfileHeader />
            <ProfileForm />
        </DirtyProvider>
    )
}

function ProfileHeader() {
    const isDirty = useDirtyStore<UserProfile, boolean>(s => s.isDirty)
    const reset = useDirtyStore<UserProfile, () => void>(s => s.reset)

    return (
        <header>
            <h1>Профиль</h1>
            {isDirty && (
                <>
                    <span>Есть несохранённые изменения</span>
                    <button onClick={reset}>Сбросить</button>
                </>
            )}
        </header>
    )
}

function ProfileForm() {
    const nameField  = useField<UserProfile, 'name'>('name')
    const emailField = useField<UserProfile, 'email'>('email')
    const bioField   = useField<UserProfile, 'bio'>('bio')
    const storeApi   = useDirtyStoreApi<UserProfile>()
    const isDirty    = useDirtyStore<UserProfile, boolean>(s => s.isDirty)
    const { isPending, mutate } = useSaveMutation()

    const handleSave = () => {
        const { workingCopy, commit } = storeApi.getState()
        mutate(workingCopy, { onSuccess: commit })
    }

    return (
        <form>
            <input value={nameField.value}  onChange={nameField.onInputChange} />
            <input value={emailField.value} onChange={emailField.onInputChange} />
            <textarea value={bioField.value} onChange={bioField.onInputChange} />

            <button onClick={handleSave} disabled={!isDirty || isPending}>
                {isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
        </form>
    )
}
```

---

### Данные загружаются асинхронно

**Предпочтительный вариант — Suspense:**

```tsx
// Данные уже есть при рендере — initialize() не нужен
function ProfilePage({ id }: { id: string }) {
    const { data } = useSuspenseQuery({
        queryKey: ['profile', id],
        queryFn: () => api.fetchProfile(id),
    })

    return (
        <DirtyProvider<UserProfile> initial={data}>
            <ProfileForm />
        </DirtyProvider>
    )
}
```

**Без Suspense — через `initialize()`:**

```tsx
function ProfilePage({ id }: { id: string }) {
    const { data } = useQuery({
        queryKey: ['profile', id],
        queryFn: () => api.fetchProfile(id),
    })

    if (!data) return <Spinner />

    return (
        <DirtyProvider<UserProfile> initial={data}>
            <ProfileForm />
        </DirtyProvider>
    )
}
```

**Автоматическая реинициализация при смене сущности:**

```tsx
// reinitializeOnChange сбросит workingCopy когда пропа initial изменится
// Подходит когда компонент не размонтируется при выборе другого элемента
function ProfilePage({ userId }: { userId: string }) {
    const { data } = useSuspenseQuery({
        queryKey: ['profile', userId],
        queryFn: () => api.fetchProfile(userId),
    })

    return (
        <DirtyProvider<UserProfile>
            initial={data}
            reinitializeOnChange
        >
            <ProfileForm />
        </DirtyProvider>
    )
}
```

> Предпочтительнее размонтировать провайдер через `key={userId}` — это гарантированно чистит стор без риска сбросить изменения в процессе редактирования.

---

### Индикаторы на уровне поля

```tsx
function NameField() {
    const field = useField<UserProfile, 'name'>('name')

    return (
        <div className={field.isDirty ? 'border-amber-400' : 'border-gray-200'}>
            <label>Имя {field.isDirty && <span title="Изменено">●</span>}</label>
            <input value={field.value} onChange={field.onInputChange} />
        </div>
    )
}
```

Список изменённых полей через `dirtyFields`:

```tsx
function ChangesSummary() {
    const dirtyFields = useDirtyStore<UserProfile, Set<keyof UserProfile>>(
        s => s.dirtyFields
    )

    if (dirtyFields.size === 0) return null

    return (
        <p>Изменено: {[...dirtyFields].join(', ')}</p>
    )
}
```

---

## Несколько провайдеров на странице

Каждый `<DirtyProvider>` полностью изолирован. Для агрегации и блокировки навигации — см. [`DirtyGuard.md`](./DirtyGuard.md).

```tsx
// Секции не знают друг о друге — у каждой своя кнопка сохранения
function SettingsPage() {
    return (
        <div>
            <DirtyProvider<ProfileSettings> initial={profileData}>
                <ProfileSection />
            </DirtyProvider>

            <DirtyProvider<NotificationSettings> initial={notifData}>
                <NotificationsSection />
            </DirtyProvider>
        </div>
    )
}
```

---

## Сравнение: shallowEqual и вложенные объекты

Стор использует `===` для сравнения значений полей. Это работает для примитивов и ссылок на объекты.

```tsx
// ✅ Работает — примитивы
type Profile = { name: string; age: number; active: boolean }

// ✅ Работает — ссылка на объект (сравниваются ссылки)
type Item = { id: string; tags: string[] }
// tags изменится при updateField('tags', [...item.tags, 'new']) — новый массив

// ❌ Не работает — вложенный объект, изменённый мутацией
// workingCopy.address === original.address (одна ссылка) → isDirty: false
type User = { name: string; address: { city: string } }
```

Для вложенных структур используй несколько плоских `<DirtyProvider>` — по одному на секцию. Описание паттерна в [`DirtyGuard.md`](./DirtyGuard.md).
