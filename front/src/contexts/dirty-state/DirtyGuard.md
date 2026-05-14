# dirty-guard

Guard для агрегированного отслеживания несохранённых изменений в полях и секциях с блокировкой навигации.

---

## Концепция

Все участники — поля (`useField`) и вложенные секции (`DirtyGuardProvider id="..."`) — используют единый интерфейс `EntryApi`:

```typescript
type EntryApi = {
    commit: () => void
    reset:  () => void
}
```

Guard хранит:
- `entries: Map<id, EntryApi>` — все зарегистрированные участники
- `dirtyIds: Set<id>` — кто из них грязный

`commitAll` / `resetAll` обходят `entries` и вызывают соответствующий метод у каждого.

### Поток регистрации

```
useField('title', '')
  mount    → guard.register('title', { commit, reset })
  isDirty  → guard.markDirty('title')
  !isDirty → guard.markClean('title')
  unmount  → cleanup: удаляет из entries и dirtyIds

DirtyGuardProvider id="meta"  (внутри другого Guard)
  mount    → parentGuard.register('meta', { commit: commitAll, reset: resetAll })
  isDirtyAnywhere → parentGuard.markDirty('meta')
  unmount  → cleanup
```

### Два контекста

- **`GuardContext`** — публичный, для `useGuardState`, `useGuardActions`, `useGuardBlocker`
- **`GuardApiContext`** — внутренний, стабильный `apiRef`, для `useField` и вложенных Guard. Не вызывает ре-рендеры при изменении `dirtyIds`.

---

## API

### `<DirtyGuardProvider id? confirmMessage? skipBuiltinBlocker?>`

| Проп | Тип | По умолчанию | Описание |
|---|---|---|---|
| `id` | `string` | — | Регистрирует в родительском Guard. Используй для секций. |
| `confirmMessage` | `string` | `"Есть несохранённые изменения. Покинуть страницу?"` | Текст `window.confirm` |
| `skipBuiltinBlocker` | `boolean` | `false` | Отключить встроенный confirm. Использовать с `useGuardBlocker()` |

### `useGuardState()`

```tsx
const { isDirtyAnywhere, dirtyIds, dirtyCount, isDirty } = useGuardState()
```

| Возвращает | Описание |
|---|---|
| `isDirtyAnywhere` | `true` если хотя бы один участник грязный |
| `dirtyIds` | `Set<string>` грязных id |
| `dirtyCount` | Количество грязных участников |
| `isDirty(id)` | Проверить конкретный участник |

### `useGuardActions()`

```tsx
const { commitAll, resetAll } = useGuardActions()
```

`commitAll()` — вызвать `commit()` у всех зарегистрированных участников.
`resetAll()` — вызвать `reset()` у всех.

### `useGuardBlocker()`

Возвращает объект `blocker` из TanStack Router. Использовать только с `skipBuiltinBlocker`.

| `blocker.*` | Описание |
|---|---|
| `status` | `'idle' \| 'blocked'` |
| `proceed()` | Разрешить переход |
| `reset()` | Отменить переход |

---

## Примеры

### Простая форма

```tsx
function SettingsPage({ settings }) {
    return (
        <DirtyGuardProvider confirmMessage="Настройки не сохранены. Уйти?">
            <SettingsForm settings={settings} />
        </DirtyGuardProvider>
    )
}

function SettingsForm({ settings }) {
    const themeField    = useField<string>('theme', settings.theme)
    const languageField = useField<string>('language', settings.language)
    const { isDirtyAnywhere } = useGuardState()
    const { commitAll } = useGuardActions()
    const { mutate } = useSaveMutation()

    return (
        <form>
            <Select value={themeField.value} onValueChange={themeField.onChange} />
            <Select value={languageField.value} onValueChange={languageField.onChange} />
            <button
                disabled={!isDirtyAnywhere}
                onClick={() => mutate(
                    { theme: themeField.value, language: languageField.value },
                    { onSuccess: commitAll }
                )}
            >
                Сохранить
            </button>
        </form>
    )
}
```

---

### Секции через вложенные Guard

Вместо `DirtyProvider` — вложенный `<DirtyGuardProvider id="...">`.

```tsx
type ArticleMeta    = { title: string; slug: string }
type ArticleContent = { body: string }

function ArticleEditor({ meta, content }) {
    return (
        <DirtyGuardProvider>
            <DirtyGuardProvider id="meta">
                <MetaSection meta={meta} />
            </DirtyGuardProvider>

            <DirtyGuardProvider id="content">
                <ContentSection content={content} />
            </DirtyGuardProvider>

            <EditorToolbar />
        </DirtyGuardProvider>
    )
}

function MetaSection({ meta }) {
    const titleField = useField<string>('title', meta.title)
    const slugField  = useField<string>('slug', meta.slug)
    const { isDirtyAnywhere } = useGuardState()  // видит только эту секцию
    const { commitAll } = useGuardActions()
    const { mutate } = useSaveMetaMutation()

    return (
        <section>
            <input value={titleField.value} onChange={titleField.onInputChange} />
            <input value={slugField.value}  onChange={slugField.onInputChange} />
            <button
                disabled={!isDirtyAnywhere}
                onClick={() => mutate(
                    { title: titleField.value, slug: slugField.value },
                    { onSuccess: commitAll }
                )}
            >
                Сохранить мету
            </button>
        </section>
    )
}

function EditorToolbar() {
    const { isDirtyAnywhere, isDirty } = useGuardState()  // видит обе секции
    const { commitAll } = useGuardActions()

    return (
        <div>
            {isDirty('meta') && <Tag>Мета изменена</Tag>}
            {isDirty('content') && <Tag>Контент изменён</Tag>}
            <button disabled={!isDirtyAnywhere} onClick={handleSaveAll}>
                Сохранить всё
            </button>
        </div>
    )
}
```

---

### Кастомный диалог блокировки

```tsx
function EditorPage() {
    return (
        <DirtyGuardProvider skipBuiltinBlocker>
            <DirtyGuardProvider id="content">
                <ContentSection />
            </DirtyGuardProvider>
            <NavigationGuard />
        </DirtyGuardProvider>
    )
}

function NavigationGuard() {
    const blocker = useGuardBlocker()
    if (blocker.status !== 'blocked') return null

    return (
        <Dialog open>
            <DialogTitle>Есть несохранённые изменения</DialogTitle>
            <DialogDescription>Покинуть страницу? Изменения будут потеряны.</DialogDescription>
            <DialogFooter>
                <Button variant="ghost" onClick={blocker.reset}>Остаться</Button>
                <Button variant="destructive" onClick={blocker.proceed}>Покинуть</Button>
            </DialogFooter>
        </Dialog>
    )
}
```

---

### Переключение сущности с подтверждением

```tsx
function DocumentsPage() {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
        <DirtyGuardProvider skipBuiltinBlocker>
            <DocumentList selectedId={selectedId} onSelect={handleSelect} />
            {selectedId && (
                <DirtyGuardProvider id="document" key={selectedId}>
                    <DocumentEditor id={selectedId} />
                </DirtyGuardProvider>
            )}
            <SwitchGuard onConfirm={setSelectedId} />
        </DirtyGuardProvider>
    )
}

function SwitchGuard({ onConfirm }) {
    const { isDirtyAnywhere } = useGuardState()
    const { resetAll } = useGuardActions()
    const [pending, setPending] = useState<string | null>(null)

    const handleSelect = (id: string) => {
        if (isDirtyAnywhere) { setPending(id); return }
        onConfirm(id)
    }

    const handleConfirm = () => {
        if (!pending) return
        resetAll()
        onConfirm(pending)
        setPending(null)
    }

    // ... диалог при pending !== null
}
```

---

## Ограничения

- `useGuardState`, `useGuardActions`, `useGuardBlocker` — только внутри `<DirtyGuardProvider>`
- `useGuardBlocker` требует TanStack Router в дереве
- После `commitAll()` Guard очищается асинхронно (через один render-цикл) — поля сами вызывают `markClean` после ре-рендера
