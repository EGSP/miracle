# dirty-state

Утилита для отслеживания несохранённых изменений внутри одной секции/формы.

Построена на паттерне **Context + Zustand `createStore`**: каждый `<DirtyProvider>` создаёт изолированный стор, который живёт внутри React-дерева и не виден снаружи. Если провайдер находится внутри `<DirtyGuardProvider>` и имеет prop `id` — он автоматически сообщает гварду о своём состоянии.

---

## Концепция

Стор хранит два объекта:

- `original` — исходный объект, эталон (то, что пришло с сервера)
- `workingCopy` — рабочая копия, которую редактирует пользователь

При каждом изменении поля `workingCopy` сравнивается с `original`. Если они отличаются — `isDirty: true`, и заполняется `dirtyFields` — набор ключей изменённых полей.

```
original:     { title: "Привет", status: "draft" }
workingCopy:  { title: "Новый заголовок", status: "draft" }

isDirty:      true
dirtyFields:  Set { "title" }
```

После сохранения вызывается `commit()` — `workingCopy` становится новым `original`, стор снова чистый.

---

## Пустой `initial` и `initialize`

### Что будет если передать пустой объект

```tsx
<DirtyProvider<Document> initial={{}}>
```

Стор создастся корректно — `original = {}`, `workingCopy = {}`, `isDirty = false`. Проблема возникает когда пользователь начинает вводить данные: `updateField('title', 'Привет')` поставит `workingCopy = { title: 'Привет' }`, и при сравнении с `original = {}` получится `isDirty: true`. Пользователь ещё ничего не менял осознанно, но стор уже считает данные грязными.

TypeScript защитит от этого если тип `Document` имеет обязательные поля — `{}` не пройдёт без `as` или `Partial`.

### Когда нужен `initialize`

Используй когда данные приходят **асинхронно после монтирования** провайдера:

```
Провайдер монтируется → получает {} → запрос на сервер → данные пришли → ???
```

Без `initialize` нет способа атомарно сказать стору «вот настоящий оригинал». Если вызывать `updateField` для каждого поля — стор решит что всё изменилось относительно `{}`, и `isDirty` станет `true` сразу.

`initialize(data)` заменяет `original` и `workingCopy` **одновременно** и сбрасывает флаги:

```
initialize(serverData)
  → original     = serverData
  → workingCopy  = { ...serverData }   // копия
  → isDirty      = false
  → dirtyFields  = Set {}
```

**Предпочтительный вариант** — дождаться данных снаружи и передать в `initial`. Тогда `initialize` не нужен вообще. Паттерн с пустым `initial` + последующим `initialize` — для случаев когда архитектура не позволяет ждать.

---

## Быстрый старт

```tsx
// 1. Обернуть страницу в DirtyProvider с исходными данными
<DirtyProvider<Doc> initial={serverData}>
  <DocumentHeader />
  <DocumentForm />
  <DocumentActions />
</DirtyProvider>

// 2. В любом дочернем компоненте читать состояние
const { isDirty, reset } = useDirtyState<Doc>()

// 3. Привязать поле к инпуту
const titleField = useField<Doc, 'title'>('title')
<input value={titleField.value} onChange={titleField.onInputChange} />
```

---

## API

### `<DirtyProvider initial id?>`

Оборачивает секцию или форму. Создаёт изолированный стор.

| Проп      | Тип      | Обязателен | Описание |
|-----------|----------|------------|----------|
| `initial` | `T`      | да         | Исходный объект — эталон для сравнения |
| `id`      | `string` | нет        | Идентификатор секции. Обязателен если провайдер находится внутри `<DirtyGuardProvider>` |

```tsx
type Document = {
  title: string
  description: string
  status: 'draft' | 'published'
}

// Без гварда — id не нужен
<DirtyProvider<Document> initial={{ title: '', description: '', status: 'draft' }}>
  {children}
</DirtyProvider>

// Внутри гварда — id обязателен
<DirtyGuardProvider>
  <DirtyProvider<Document> id="document" initial={serverData}>
    {children}
  </DirtyProvider>
</DirtyGuardProvider>
```

> Стор создаётся один раз при монтировании. Изменение `initial` после монтирования не влияет на стор — используй `initialize()`.

---

### `useDirtyState<T>()`

Возвращает флаги состояния и действия верхнего уровня. Не привязан к конкретному полю.

```tsx
const { isDirty, dirtyFields, reset, commit, initialize } = useDirtyState<Document>()
```

| Возвращает         | Тип                  | Описание |
|--------------------|----------------------|----------|
| `isDirty`          | `boolean`            | `true` если хоть одно поле изменилось |
| `dirtyFields`      | `Set<keyof T>`       | Набор ключей изменённых полей |
| `reset()`          | `() => void`         | Сбросить `workingCopy` к `original` |
| `commit()`         | `() => void`         | Сделать `workingCopy` новым `original` (вызывать после сохранения) |
| `initialize(data)` | `(data: T) => void`  | Атомарно заменить оба объекта новыми данными |

**Пример — шапка с индикатором:**

```tsx
function DocumentHeader() {
  const { isDirty, reset } = useDirtyState<Document>()

  return (
    <header>
      <h1>Документ</h1>
      {isDirty && (
        <>
          <span>● Есть несохранённые изменения</span>
          <button onClick={reset}>Сбросить</button>
        </>
      )}
    </header>
  )
}
```

**Пример — кнопка сохранения:**

```tsx
function DocumentActions() {
  const { isDirty, commit } = useDirtyState<Document>()
  const workingCopy = useDirtyStore<Document, Document>(s => s.workingCopy)

  const handleSave = async () => {
    await api.save(workingCopy)
    commit() // теперь workingCopy — новый эталон, isDirty → false
  }

  return (
    <button onClick={handleSave} disabled={!isDirty}>
      Сохранить
    </button>
  )
}
```

---

### `useField<T, K>(key)`

Хук для привязки одного поля к компоненту. Подписывается **только на это поле** — смена других полей не вызывает ре-рендер.

```tsx
const field = useField<Document, 'title'>('title')
```

| Возвращает      | Тип                             | Описание |
|-----------------|---------------------------------|----------|
| `value`         | `T[K]`                          | Текущее значение поля из `workingCopy` |
| `isDirty`       | `boolean`                       | `true` если это поле изменилось |
| `onChange`      | `(value: T[K]) => void`         | Для кастомных компонентов — принимает значение напрямую |
| `onInputChange` | `(e: ChangeEvent<...>) => void` | Для нативных `<input>` / `<textarea>` — принимает event |

#### Нативные компоненты — `onInputChange`

Нативные `<input>` и `<textarea>` оборачивают значение в `SyntheticEvent`. Значение лежит в `e.target.value`. Используй `onInputChange`:

```tsx
function TitleField() {
  const field = useField<Document, 'title'>('title')

  return (
    <div>
      <label>
        Заголовок
        {field.isDirty && <span title="Изменено">*</span>}
      </label>
      <input
        value={field.value}
        onChange={field.onInputChange}  // ← принимает event
      />
    </div>
  )
}
```

```tsx
function DescriptionField() {
  const field = useField<Document, 'description'>('description')

  return (
    <textarea
      value={field.value}
      onChange={field.onInputChange}  // ← то же самое для textarea
    />
  )
}
```

#### Кастомные компоненты — `onChange`

Кастомные компоненты (Select, DatePicker, Switch и др.) вызывают `onChange(value)` напрямую — без event-обёртки. Используй `onChange`:

```tsx
// shadcn/ui Select
function StatusField() {
  const field = useField<Document, 'status'>('status')

  return (
    <Select
      value={field.value}
      onValueChange={field.onChange}  // ← Select передаёт строку напрямую
    >
      <SelectTrigger />
      <SelectContent>
        <SelectItem value="draft">Черновик</SelectItem>
        <SelectItem value="published">Опубликован</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

```tsx
// DatePicker
function DeadlineField() {
  const field = useField<Document, 'deadline'>('deadline')

  return (
    <DatePicker
      value={field.value}
      onChange={field.onChange}  // ← DatePicker передаёт Date напрямую
    />
  )
}
```

```tsx
// Switch / Toggle
function ActiveField() {
  const field = useField<Document, 'isActive'>('isActive')

  return (
    <Switch
      checked={field.value}
      onCheckedChange={field.onChange}  // ← передаёт boolean напрямую
    />
  )
}
```

**Разница `onChange` vs `onInputChange`:**

| | `onChange` | `onInputChange` |
|---|---|---|
| Аргумент | Само значение `T[K]` | `React.ChangeEvent<HTMLInput...>` |
| Когда использовать | Кастомные компоненты | Нативные `<input>`, `<textarea>` |
| Пример | `onValueChange={field.onChange}` | `onChange={field.onInputChange}` |

---

### `useGetFieldProps<T>()`

Фабрика, возвращающая функцию `getFieldProps(key)`. Та возвращает `{ value, onChange }` — готовый объект для спреда в нативный `<input>`.

```tsx
function DocumentForm() {
  const getFieldProps = useGetFieldProps<Document>()

  return (
    <form>
      <input {...getFieldProps('title')} placeholder="Заголовок" />
      <input {...getFieldProps('author')} placeholder="Автор" />
      <textarea {...getFieldProps('description')} />
    </form>
  )
}
```

> `useGetFieldProps` подписывается на весь `workingCopy` — при любом изменении компонент ре-рендерится. Для форм с большим количеством полей используй `useField` на каждое поле отдельно.

---

### `useDirtyStore<T, R>(selector)`

Низкоуровневый доступ к стору через селектор. Подписывается только на выбранный кусок состояния.

```tsx
// Прочитать workingCopy для отправки на сервер
const workingCopy = useDirtyStore<Document, Document>(s => s.workingCopy)

// Прочитать original
const original = useDirtyStore<Document, Document>(s => s.original)
```

---

## Загрузка данных с сервера

### Вариант А — данные уже есть при рендере (предпочтительно)

```tsx
function DocumentPage({ id }: { id: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ['document', id],
    queryFn: () => api.fetchDocument(id),
  })

  return (
    <DirtyProvider<Document> initial={data}>
      <DocumentForm />
    </DirtyProvider>
  )
}
```

### Вариант Б — данные приходят асинхронно внутри

```tsx
function DocumentForm({ id }: { id: string }) {
  const { initialize } = useDirtyState<Document>()
  const { data } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.fetchDocument(id),
  })

  useEffect(() => {
    if (data) initialize(data)
  }, [data])

  // ...поля формы
}

// Провайдер стартует с заглушкой
<DirtyProvider<Document> initial={emptyDocument}>
  <DocumentForm id={id} />
</DirtyProvider>
```

### Сохранение с commit

```tsx
function DocumentActions() {
  const { isDirty, commit } = useDirtyState<Document>()
  const workingCopy = useDirtyStore<Document, Document>(s => s.workingCopy)

  const { mutate, isPending } = useMutation({
    mutationFn: (data: Document) => api.saveDocument(data),
    onSuccess: () => {
      commit()  // стор → чистый, текущее состояние становится новым эталоном
      queryClient.invalidateQueries({ queryKey: ['document'] })
    },
  })

  return (
    <button onClick={() => mutate(workingCopy)} disabled={!isDirty || isPending}>
      {isPending ? 'Сохранение...' : 'Сохранить'}
    </button>
  )
}
```

---

## Индикаторы на уровне поля

`useField` возвращает `isDirty` для конкретного поля:

```tsx
function TitleField() {
  const field = useField<Document, 'title'>('title')

  return (
    <div className={field.isDirty ? 'border-amber-400' : 'border-gray-300'}>
      <input value={field.value} onChange={field.onInputChange} />
      {field.isDirty && <span>изменено</span>}
    </div>
  )
}
```

Или агрегированно через `dirtyFields`:

```tsx
const { dirtyFields } = useDirtyState<Document>()

dirtyFields.has('title')   // конкретное поле
dirtyFields.size           // количество изменённых полей
[...dirtyFields]           // список изменённых ключей
```

---

## Несколько провайдеров на странице

Каждый `<DirtyProvider>` полностью изолирован. Для отслеживания нескольких секций вместе — используй `<DirtyGuardProvider>` (см. `dirty-guard.md`).

```tsx
// Изолированные провайдеры — не знают друг о друге
export function SettingsPage() {
  return (
    <div>
      <DirtyProvider<Profile> initial={profileData}>
        <ProfileSection />
      </DirtyProvider>

      <DirtyProvider<Settings> initial={settingsData}>
        <SettingsSection />
      </DirtyProvider>
    </div>
  )
}
```
