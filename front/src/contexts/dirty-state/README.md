# dirty-state / dirty-guard

Механизм отслеживания несохранённых изменений в формах и секциях с опциональной блокировкой навигации.

---

## Из чего состоит

| Часть | Файл | Назначение |
|---|---|---|
| **DirtyState** | `DirtyStateContext.tsx` | Отслеживает изменения в одной форме/секции |
| **DirtyGuard** | `DirtyGuardContext.tsx` | Агрегирует несколько секций, блокирует навигацию |

Обе части независимы. `DirtyState` работает без `DirtyGuard`. `DirtyGuard` бесполезен без хотя бы одного `DirtyState` с `id`.

---

## Ключевые идеи

**Изоляция через Context + Zustand `createStore`.** Каждый `<DirtyProvider>` создаёт собственный стор в React-дереве — нет глобального стейта, нет утечек между страницами.

**Сравнение через `original` / `workingCopy`.** Стор хранит исходное состояние (эталон с сервера) и рабочую копию. При каждом изменении сравнивает их — если отличаются, `isDirty: true`.

**Автоматическая регистрация в гварде.** Если `<DirtyProvider id="...">` находится внутри `<DirtyGuardProvider>` — он сам регистрируется в гварде при появлении изменений и снимает регистрацию при сбросе или размонтировании.

**Блокировка навигации.** `DirtyGuardProvider` перехватывает переходы TanStack Router и событие `beforeunload` — пока хотя бы одна секция грязная.

---

## Сценарий 1 — простая форма

Одна форма, один провайдер. Гвард не нужен.

```tsx
import { DirtyProvider, useDirtyState, useField } from './DirtyStateContext'

type Document = {
  title: string
  description: string
}

// Провайдер оборачивает страницу — данные уже загружены
function DocumentPage({ data }: { data: Document }) {
  return (
    <DirtyProvider<Document> initial={data}>
      <DocumentForm />
    </DirtyProvider>
  )
}

function DocumentForm() {
  const titleField = useField<Document, 'title'>('title')
  const descField = useField<Document, 'description'>('description')
  const { isDirty, reset, commit } = useDirtyState<Document>()

  const handleSave = async () => {
    await api.save({ title: titleField.value, description: descField.value })
    commit() // workingCopy становится новым original → isDirty: false
  }

  return (
    <form>
      <input value={titleField.value} onChange={titleField.onInputChange} />
      <textarea value={descField.value} onChange={descField.onInputChange} />

      <button onClick={handleSave} disabled={!isDirty}>Сохранить</button>
      <button onClick={reset} disabled={!isDirty} type="button">Сбросить</button>
    </form>
  )
}
```

**Что здесь происходит:**
- `<DirtyProvider>` создаёт изолированный стор с `original = data`.
- `useField` привязывает поле к компоненту и подписывается только на него — смена `description` не ре-рендерит компонент с `title`.
- `commit()` после сохранения делает текущий `workingCopy` новым эталоном.

---

## Сценарий 2 — индикатор изменений в шапке

Индикатор живёт в другом компоненте — тоже внутри `<DirtyProvider>`.

```tsx
function DocumentPage({ data }: { data: Document }) {
  return (
    <DirtyProvider<Document> initial={data}>
      <DocumentHeader />
      <DocumentForm />
    </DirtyProvider>
  )
}

function DocumentHeader() {
  const { isDirty, dirtyFields } = useDirtyState<Document>()

  return (
    <header>
      <h1>Документ</h1>
      {isDirty && (
        <span title={`Изменено: ${[...dirtyFields].join(', ')}`}>
          ● Есть несохранённые изменения
        </span>
      )}
    </header>
  )
}
```

Провайдер один — компоненты шапки и формы читают один стор.

---

## Сценарий 3 — данные загружаются асинхронно

Когда данные нельзя получить до монтирования провайдера.

```tsx
// Предпочтительный вариант — дождаться данных снаружи (Suspense / useSuspenseQuery)
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

```tsx
// Если Suspense недоступен — initialize() внутри компонента
function DocumentForm({ id }: { id: string }) {
  const { initialize } = useDirtyState<Document>()
  const { data } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.fetchDocument(id),
  })

  useEffect(() => {
    if (data) initialize(data) // атомарно заменяет original и workingCopy
  }, [data])

  // ...поля
}

// Провайдер стартует с заглушкой
<DirtyProvider<Document> initial={emptyDocument}>
  <DocumentForm id={id} />
</DirtyProvider>
```

---

## Сценарий 4 — несколько изолированных форм на странице

Секции не знают друг о друге — нет агрегации.

```tsx
type Profile = { name: string; email: string }
type Settings = { theme: 'light' | 'dark'; language: string }

function SettingsPage({ profile, settings }) {
  return (
    <div>
      {/* Каждый провайдер полностью изолирован */}
      <DirtyProvider<Profile> initial={profile}>
        <ProfileSection />
      </DirtyProvider>

      <DirtyProvider<Settings> initial={settings}>
        <SettingsSection />
      </DirtyProvider>
    </div>
  )
}
```

Подходит когда у каждой секции своя кнопка сохранения и агрегированный статус не нужен.

---

## Сценарий 5 — несколько секций с гвардом

Гвард нужен когда:
- есть кнопка "Сохранить всё" или глобальный индикатор изменений,
- нужно заблокировать навигацию пока хоть одна секция грязная.

```tsx
import { DirtyGuardProvider, useGuardState } from './DirtyGuardContext'
import { DirtyProvider, useDirtyState, useField } from './DirtyStateContext'

type Meta = { title: string; status: 'draft' | 'published' }
type Content = { body: string; summary: string }

function EditorPage({ meta, content }) {
  return (
    // Guard оборачивает страницу целиком
    <DirtyGuardProvider confirmMessage="Есть несохранённые изменения. Покинуть редактор?">
      <DirtyProvider<Meta> id="meta" initial={meta}>
        <MetaSection />
      </DirtyProvider>

      <DirtyProvider<Content> id="content" initial={content}>
        <ContentSection />
      </DirtyProvider>

      {/* Тулбар снаружи секций — видит агрегированный статус */}
      <EditorToolbar />
    </DirtyGuardProvider>
  )
}

function EditorToolbar() {
  const { isDirtyAnywhere, isDirty, dirtyCount } = useGuardState()

  return (
    <div>
      {isDirtyAnywhere && (
        <span>● Несохранённых секций: {dirtyCount}</span>
      )}
      <button disabled={!isDirty('meta')} onClick={saveMeta}>
        Сохранить мету
      </button>
      <button disabled={!isDirtyAnywhere} onClick={saveAll}>
        Сохранить всё
      </button>
    </div>
  )
}
```

**Что происходит при навигации:** если пользователь пытается перейти на другой маршрут пока `dirtyCount > 0`, TanStack Router покажет `window.confirm` с текстом `confirmMessage`.

---

## Сценарий 6 — кастомный диалог блокировки вместо window.confirm

```tsx
import { useGuardBlocker } from './DirtyGuardContext'

function NavigationGuard() {
  const blocker = useGuardBlocker()

  if (blocker.status !== 'blocked') return null

  return (
    <Dialog open>
      <DialogTitle>Несохранённые изменения</DialogTitle>
      <DialogDescription>
        Если вы покинете страницу, все изменения будут потеряны.
      </DialogDescription>
      <DialogFooter>
        <Button variant="ghost" onClick={blocker.reset}>
          Остаться
        </Button>
        <Button variant="destructive" onClick={blocker.proceed}>
          Всё равно уйти
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function EditorPage({ meta, content }) {
  return (
    <DirtyGuardProvider>
      <DirtyProvider<Meta> id="meta" initial={meta}>
        <MetaSection />
      </DirtyProvider>
      {/* NavigationGuard должен быть внутри DirtyGuardProvider */}
      <NavigationGuard />
    </DirtyGuardProvider>
  )
}
```

`useGuardBlocker` возвращает объект `blocker` из TanStack Router. Когда пользователь пытается уйти — `blocker.status` меняется на `'blocked'`, компонент рендерит диалог. `proceed()` отпускает навигацию, `reset()` отменяет.

---

## Сценарий 7 — гвард на уровне лэйаута

Страница рендерится внутри `<Outlet>` — гвард живёт в лэйауте и перехватывает любую навигацию.

```tsx
function AppLayout() {
  return (
    <DirtyGuardProvider>
      <nav>
        <Link to="/dashboard">Дашборд</Link>
        <Link to="/settings">Настройки</Link>
      </nav>
      {/* Страницы с DirtyProvider рендерятся здесь */}
      <Outlet />
      <NavigationGuard />
    </DirtyGuardProvider>
  )
}

// На странице — просто DirtyProvider с id
function DocumentPage({ data }) {
  return (
    <DirtyProvider<Document> id="document" initial={data}>
      <DocumentForm />
    </DirtyProvider>
  )
}
```

Ссылки в навигации не требуют никакой специальной обработки — `useBlocker` перехватывает переход автоматически.

---

## Сценарий 8 — вложенные гварды

Используй когда разные зоны страницы требуют разных сообщений или независимых блокировок.

```tsx
// Внешний гвард отслеживает профиль и настройки
<DirtyGuardProvider confirmMessage="Не сохранить изменения?">
  <DirtyProvider<Profile> id="profile" initial={profile}>
    <ProfileSection />
  </DirtyProvider>

  {/* Вложенный гвард — только для платёжных данных */}
  <DirtyGuardProvider confirmMessage="Платёжные данные не сохранены. Уйти?">
    <DirtyProvider<Payment> id="payment" initial={payment}>
      <PaymentSection />
    </DirtyProvider>
  </DirtyGuardProvider>

  <DirtyProvider<Settings> id="settings" initial={settings}>
    <SettingsSection />
  </DirtyProvider>
</DirtyGuardProvider>
```

Каждый `DirtyProvider` регистрируется в **ближайшем** гварде вверх по дереву.

---

## Выбор подхода

| Ситуация | Решение |
|---|---|
| Одна форма, не нужна блокировка навигации | `<DirtyProvider>` + `useDirtyState` / `useField` |
| Индикатор изменений в шапке той же секции | `useDirtyState` в любом дочернем компоненте |
| Несколько форм, каждая сохраняется отдельно | Несколько изолированных `<DirtyProvider>` |
| Кнопка "Сохранить всё" или глобальный индикатор | `<DirtyGuardProvider>` + `<DirtyProvider id="...">` |
| Блокировать навигацию через `window.confirm` | `<DirtyGuardProvider confirmMessage="...">` |
| Блокировать навигацию через кастомный диалог | `<DirtyGuardProvider>` + `useGuardBlocker` |
| Разные зоны с разными сообщениями | Вложенные `<DirtyGuardProvider>` |

---

## Справка по API

### DirtyState

| Хук / компонент | Где использовать | Что делает |
|---|---|---|
| `<DirtyProvider initial id?>` | Оборачивает секцию | Создаёт изолированный стор |
| `useDirtyState<T>()` | Внутри `DirtyProvider` | `isDirty`, `dirtyFields`, `reset`, `commit`, `initialize` |
| `useField<T, K>(key)` | Внутри `DirtyProvider` | Привязка поля: `value`, `isDirty`, `onChange`, `onInputChange` |
| `useGetFieldProps<T>()` | Внутри `DirtyProvider` | Шорткат для нативных `<input>` / `<textarea>` |
| `useDirtyStore<T, R>(selector)` | Внутри `DirtyProvider` | Низкоуровневый доступ к стору |

### DirtyGuard

| Хук / компонент | Где использовать | Что делает |
|---|---|---|
| `<DirtyGuardProvider confirmMessage?>` | Оборачивает страницу | Создаёт гвард, блокирует навигацию |
| `useGuardState()` | Внутри `DirtyGuardProvider` | `isDirtyAnywhere`, `dirtyIds`, `dirtyCount`, `isDirty(id)` |
| `useGuard(selector)` | Внутри `DirtyGuardProvider` | Низкоуровневый доступ к стору гварда |
| `useGuardBlocker()` | Внутри `DirtyGuardProvider` | Кастомный UI блокера: `blocker.status`, `proceed`, `reset` |

---

## Подробная документация

- [DirtyState.md](./DirtyState.md) — полное описание стора, хуков, примеры с нативными и кастомными компонентами
- [DirtyGuard.md](./DirtyGuard.md) — полное описание гварда, вложенность, блокировка навигации
