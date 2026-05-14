# dirty-guard

Утилита для **агрегированного** отслеживания несохранённых изменений в нескольких секциях и блокировки навигации.

Построена на паттерне **Context + Zustand `createStore`**: `<DirtyGuardProvider>` создаёт изолированный стор, в который `<DirtyProvider id="...">` автоматически регистрируются — без передачи пропов вручную.

---

## Концепция

`DirtyProvider` с prop `id` сам находит ближайший `DirtyGuardProvider` в дереве. Когда секция становится грязной — регистрируется в гварде; когда чистой или размонтируется — снимает регистрацию.

```
DirtyGuardProvider
  dirtyIds = Set { "meta", "content" }
  sections = Map { "meta" → StoreApi, "content" → StoreApi }
           ↑ register("meta", api)       ↑ register("content", api)
  DirtyProvider id="meta"     DirtyProvider id="content"
  isDirty = true               isDirty = true
```

После вызова `commitAll()` или `resetAll()` каждая секция обновляет свой `isDirty → false` и автоматически снимает регистрацию через подписку.

### Два контекста под капотом

- **`GuardContext`** — для чтения состояния (`useGuardState`, `useGuardActions`, `useGuardBlocker`).
- **`GuardApiContext`** — только для регистрации. Передаёт стабильный объект `{ register, unregister }` — `DirtyProvider` не подписывается на стейт гварда и не ре-рендерится при изменении `dirtyIds`.

### Блокировка навигации

`DirtyGuardProvider` встраивает невидимый `GuardBlockerEffect`, который:

1. Вызывает `useBlocker` из TanStack Router — перехватывает переходы пока `dirtyIds.size > 0`.
2. Слушает `beforeunload` — блокирует закрытие вкладки.

По умолчанию показывается `window.confirm`. Для кастомного диалога — используй `useGuardBlocker` вместе с `skipBuiltinBlocker`.

---

## API

### `<DirtyGuardProvider confirmMessage? skipBuiltinBlocker?>`

| Проп | Тип | По умолчанию | Описание |
|---|---|---|---|
| `confirmMessage` | `string` | `"Есть несохранённые изменения. Покинуть страницу?"` | Текст `window.confirm` |
| `skipBuiltinBlocker` | `boolean` | `false` | Отключить встроенный `window.confirm`. Используй с `useGuardBlocker()` |

---

### `useGuardState()`

Агрегированное состояние всех секций.

| Возвращает | Тип | Описание |
|---|---|---|
| `isDirtyAnywhere` | `boolean` | `true` если хотя бы одна секция грязная |
| `dirtyIds` | `Set<string>` | id грязных секций |
| `dirtyCount` | `number` | Количество грязных секций |
| `isDirty(id)` | `(id: string) => boolean` | Проверить конкретную секцию |

```tsx
function EditorToolbar() {
    const { isDirtyAnywhere, dirtyCount, isDirty } = useGuardState()

    return (
        <div>
            {isDirtyAnywhere && <span>● {dirtyCount} несохранённых секции</span>}
            {isDirty('meta') && <Tag>Мета изменена</Tag>}
        </div>
    )
}
```

---

### `useGuardActions()`

Действия над всеми грязными секциями.

| Возвращает | Тип | Описание |
|---|---|---|
| `commitAll()` | `() => void` | Вызвать `commit()` на каждой грязной секции |
| `resetAll()` | `() => void` | Вызвать `reset()` на каждой грязной секции |

```tsx
function SaveAllButton() {
    const { isDirtyAnywhere } = useGuardState()
    const { commitAll } = useGuardActions()
    const { mutate, isPending } = useSaveAllMutation()

    const handleSave = () => {
        mutate(collectData(), { onSuccess: commitAll })
    }

    return (
        <button onClick={handleSave} disabled={!isDirtyAnywhere || isPending}>
            Сохранить всё
        </button>
    )
}
```

---

### `useGuardBlocker()`

Кастомный UI блокера навигации. Возвращает объект `blocker` из TanStack Router.

| `blocker.*` | Тип | Описание |
|---|---|---|
| `status` | `'idle' \| 'blocked'` | `'blocked'` когда навигация перехвачена |
| `proceed()` | `() => void` | Разрешить переход |
| `reset()` | `() => void` | Отменить переход |

Используй вместе с `skipBuiltinBlocker` — иначе при навигации сработают оба: `window.confirm` и кастомный диалог.

```tsx
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

function EditorPage({ meta, content }) {
    return (
        <DirtyGuardProvider skipBuiltinBlocker>
            <DirtyProvider<Meta> id="meta" initial={meta}>
                <MetaSection />
            </DirtyProvider>
            <DirtyProvider<Content> id="content" initial={content}>
                <ContentSection />
            </DirtyProvider>
            <NavigationGuard />
        </DirtyGuardProvider>
    )
}
```

---

## Примеры

### Редактор с несколькими секциями

```tsx
type ArticleMeta    = { title: string; slug: string; status: 'draft' | 'published' }
type ArticleContent = { body: string; summary: string }

function ArticleEditor({ meta, content }: { meta: ArticleMeta; content: ArticleContent }) {
    return (
        <DirtyGuardProvider confirmMessage="Изменения не сохранены. Уйти?">
            <DirtyProvider<ArticleMeta> id="meta" initial={meta}>
                <MetaSection />
            </DirtyProvider>

            <DirtyProvider<ArticleContent> id="content" initial={content}>
                <ContentSection />
            </DirtyProvider>

            <EditorToolbar />
        </DirtyGuardProvider>
    )
}

// Тулбар снаружи секций — читает агрегированный гвард
function EditorToolbar() {
    const { isDirtyAnywhere, isDirty } = useGuardState()
    const { commitAll } = useGuardActions()
    const { mutate } = useSaveArticleMutation()

    const handleSaveAll = () => {
        // собрать данные из секций через useDirtyStoreApi (внутри каждой секции)
        // или через отдельный механизм сбора
        mutate(data, { onSuccess: commitAll })
    }

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

---

### Кнопка сохранения внутри секции

Когда каждая секция сохраняется отдельно — кнопка живёт внутри `DirtyProvider` и работает напрямую со своим стором.

```tsx
function MetaSection() {
    const titleField  = useField<ArticleMeta, 'title'>('title')
    const statusField = useField<ArticleMeta, 'status'>('status')
    const isDirty     = useDirtyStore<ArticleMeta, boolean>(s => s.isDirty)
    const storeApi    = useDirtyStoreApi<ArticleMeta>()
    const { mutate }  = useSaveMetaMutation()

    const handleSave = () => {
        const { workingCopy, commit } = storeApi.getState()
        mutate(workingCopy, { onSuccess: commit })
    }

    return (
        <section>
            <input value={titleField.value} onChange={titleField.onInputChange} />
            <Select value={statusField.value} onValueChange={statusField.onChange}>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="published">Опубликован</SelectItem>
            </Select>
            <button disabled={!isDirty} onClick={handleSave}>Сохранить мету</button>
        </section>
    )
}
```

---

### Сложная сущность — плоские секции вместо одного большого объекта

Когда сущность содержит вложенные структуры или динамические списки — разбивай на плоские секции.

```tsx
// ❌ Не делай так — shallowEqual не работает для массивов и вложенных объектов
type OrderDirtyState = {
    fileId: string
    requirements: Array<{ id: string; value: string }>  // массив — проблема
}

// ✅ Делай так — каждый уровень своим плоским провайдером
type OrderBasic   = { fileId: string }
type Requirement  = { value: string; active: boolean }

function OrderEditor({ order }: { order: Order }) {
    return (
        <DirtyGuardProvider>
            <DirtyProvider<OrderBasic> id="basic" initial={{ fileId: order.fileId }}>
                <OrderBasicSection />
            </DirtyProvider>

            {order.requirements.map(req =>
                <DirtyProvider<Requirement>
                    key={req.id}
                    id={`req-${req.id}`}
                    initial={{ value: req.value, active: req.active }}
                >
                    <RequirementRow reqId={req.id} />
                </DirtyProvider>
            )}

            <SaveAllButton />
        </DirtyGuardProvider>
    )
}
```

---

### Переключение сущности с подтверждением

Паттерн для страниц со списком и деталями — переключение сущности при наличии изменений требует подтверждения.

```tsx
function DocumentsPage() {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
        <DirtyGuardProvider skipBuiltinBlocker>
            <DocumentList
                selectedId={selectedId}
                onSelect={setSelectedId}
            />
            {selectedId && (
                <DirtyProvider<Document>
                    key={selectedId}         // размонтировать стор при смене документа
                    id="document"
                    initial={documents[selectedId]}
                >
                    <DocumentEditor />
                </DirtyProvider>
            )}
            <SwitchGuard onSwitch={setSelectedId} />
        </DirtyGuardProvider>
    )
}

// Перехватывает клики по списку когда есть изменения
function SwitchGuard({ onSwitch }: { onSwitch: (id: string) => void }) {
    const { isDirtyAnywhere } = useGuardState()
    const { resetAll } = useGuardActions()
    const [pendingId, setPendingId] = useState<string | null>(null)

    const handleSelect = (id: string) => {
        if (isDirtyAnywhere) {
            setPendingId(id)  // показать диалог
        } else {
            onSwitch(id)
        }
    }

    const handleConfirm = () => {
        if (!pendingId) return
        resetAll()
        onSwitch(pendingId)
        setPendingId(null)
    }

    // ... передать handleSelect в DocumentList, показать диалог при pendingId
}
```

---

### Гвард на уровне лэйаута

```tsx
function AppLayout() {
    return (
        <DirtyGuardProvider>
            <nav>
                {/* Ссылки перехватываются автоматически через useBlocker */}
                <Link to="/documents">Документы</Link>
                <Link to="/settings">Настройки</Link>
            </nav>
            <Outlet />  {/* Страницы с DirtyProvider рендерятся здесь */}
        </DirtyGuardProvider>
    )
}

// На странице — просто DirtyProvider с id
function DocumentPage({ data }: { data: Document }) {
    return (
        <DirtyProvider<Document> id="document" initial={data}>
            <DocumentForm />
        </DirtyProvider>
    )
}
```

---

### Вложенные гварды

```tsx
// Внешний гвард — видит "profile" и "settings"
<DirtyGuardProvider confirmMessage="Изменения не сохранены. Уйти?">
    <DirtyProvider<Profile> id="profile" initial={profileData}>
        <ProfileSection />
    </DirtyProvider>

    {/* Вложенный гвард — видит только "payment", своё сообщение */}
    <DirtyGuardProvider confirmMessage="Платёжные данные не сохранены. Уйти?">
        <DirtyProvider<Payment> id="payment" initial={paymentData}>
            <PaymentSection />
        </DirtyProvider>
    </DirtyGuardProvider>

    <DirtyProvider<AppSettings> id="settings" initial={settingsData}>
        <SettingsSection />
    </DirtyProvider>
</DirtyGuardProvider>
```

Каждый `DirtyProvider` регистрируется в **ближайшем** гварде вверх по дереву.

---

## Ограничения

- `useGuardState`, `useGuardActions`, `useGuardBlocker` работают только внутри `<DirtyGuardProvider>`.
- `useGuardBlocker` требует TanStack Router в дереве.
- Гвард отслеживает секции поверхностно — только факт `isDirty`. Данные секции читай через `useDirtyStoreApi` внутри неё.
- `commitAll` / `resetAll` работают асинхронно с регистрацией — после вызова `dirtyIds` очистится в следующем тике React (через подписки `DirtyProvider`).
