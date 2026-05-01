# dirty-guard

Утилита для **агрегированного** отслеживания несохранённых изменений сразу в нескольких секциях/формах и блокировки навигации при наличии таковых.

Построена на паттерне **Context + Zustand `createStore`**: `<DirtyGuardProvider>` создаёт изолированный стор, в который `<DirtyProvider id="...">` автоматически регистрируются — без передачи пропов вручную.

---

## Концепция

`DirtyProvider` с prop `id` сам находит ближайший `DirtyGuardProvider` в дереве и подписывается на изменения своего `isDirty`. Когда секция становится грязной — она регистрируется в гварде; когда чистой или размонтируется — снимает регистрацию.

```
DirtyGuardProvider
  stор: dirtyIds = Set { "meta", "content" }
           ↑ register("meta")       ↑ register("content")
  DirtyProvider id="meta"     DirtyProvider id="content"
  isDirty = true               isDirty = true
```

Гвард хранит только `Set<string>` грязных id-шников — никаких данных форм. Компоненты снаружи провайдеров (тулбар, навигация) читают гвард через `useGuardState` и видят агрегированную картину.

### Два контекста под капотом

Гвард намеренно разделён на два контекста:

- **`GuardContext`** — для чтения состояния (`useGuard`, `useGuardState`, `useGuardBlocker`). Используется компонентами UI.
- **`GuardApiContext`** — для регистрации. Используется только внутри `DirtyProvider`. Передаёт стабильный объект `{ register, unregister }`, не вызывая лишних ре-рендеров в секциях.

### Блокировка навигации

`DirtyGuardProvider` встраивает невидимый компонент `GuardBlockerEffect`, который:

1. Вызывает `useBlocker` из TanStack Router — перехватывает переходы по маршруту пока `dirtyIds.size > 0`.
2. Слушает `beforeunload` — блокирует закрытие вкладки / перезагрузку страницы.

По умолчанию при перехвате показывается `window.confirm`. Если нужен кастомный диалог — см. [`useGuardBlocker`](#useguardblocker).

---

## Быстрый старт

```tsx
// 1. Обернуть страницу в DirtyGuardProvider
<DirtyGuardProvider>
  {/* 2. Каждый DirtyProvider получает уникальный id */}
  <DirtyProvider<Meta> id="meta" initial={metaData}>
    <MetaSection />
  </DirtyProvider>

  <DirtyProvider<Content> id="content" initial={contentData}>
    <ContentSection />
  </DirtyProvider>

  {/* 3. Тулбар снаружи секций — читает гвард */}
  <EditorToolbar />
</DirtyGuardProvider>

// 4. В тулбаре — агрегированное состояние
function EditorToolbar() {
  const { isDirtyAnywhere, dirtyCount } = useGuardState()

  return (
    <div>
      {isDirtyAnywhere && <span>● Несохранённых секций: {dirtyCount}</span>}
    </div>
  )
}
```

---

## API

### `<DirtyGuardProvider confirmMessage?>`

Оборачивает страницу или зону с несколькими секциями.

| Проп             | Тип      | Обязателен | Описание |
|------------------|----------|------------|----------|
| `confirmMessage` | `string` | нет        | Текст `window.confirm` при попытке покинуть страницу. По умолчанию: `"Есть несохранённые изменения. Покинуть страницу?"` |

```tsx
// Минимальный вариант — встроенный window.confirm
<DirtyGuardProvider>
  {children}
</DirtyGuardProvider>

// С кастомным текстом
<DirtyGuardProvider confirmMessage="Изменения не сохранены. Уйти?">
  {children}
</DirtyGuardProvider>
```

> Если нужна кастомная модалка вместо `window.confirm` — используй `useGuardBlocker` внутри провайдера (встроенный блокер при этом также активен; они не конфликтуют, но два диалога одновременно не нужны — либо одно, либо другое).

---

### `useGuardState()`

Возвращает агрегированное состояние всех секций под гвардом.

```tsx
const { isDirtyAnywhere, dirtyIds, dirtyCount, isDirty } = useGuardState()
```

| Возвращает       | Тип                    | Описание |
|------------------|------------------------|----------|
| `isDirtyAnywhere`| `boolean`              | `true` если хотя бы одна секция грязная |
| `dirtyIds`       | `Set<string>`          | Set id-шников грязных секций |
| `dirtyCount`     | `number`               | Количество грязных секций |
| `isDirty(id)`    | `(id: string) => boolean` | Проверить конкретную секцию по id |

**Пример — тулбар с индикатором:**

```tsx
function EditorToolbar() {
  const { isDirtyAnywhere, isDirty, dirtyCount } = useGuardState()

  return (
    <div>
      {isDirtyAnywhere && (
        <span>● Несохранённых изменений: {dirtyCount} секции</span>
      )}
      {isDirty('meta') && <Tag>Мета изменена</Tag>}
      {isDirty('content') && <Tag>Контент изменён</Tag>}
    </div>
  )
}
```

**Пример — кнопка "Сохранить всё":**

```tsx
function SaveAllButton() {
  const { isDirtyAnywhere } = useGuardState()

  return (
    <button disabled={!isDirtyAnywhere} onClick={handleSaveAll}>
      Сохранить всё
    </button>
  )
}
```

**Пример — кнопка сохранения конкретной секции:**

```tsx
function SaveMetaButton() {
  const { isDirty } = useGuardState()

  return (
    <button disabled={!isDirty('meta')} onClick={handleSaveMeta}>
      Сохранить мету
    </button>
  )
}
```

---

### `useGuard<R>(selector)`

Низкоуровневый доступ к стору гварда через селектор. Используй когда `useGuardState` не подходит по составу.

```tsx
const isDirtyAnywhere = useGuard(s => s.dirtyIds.size > 0)
const dirtyIds = useGuard(s => s.dirtyIds)
const isMetaDirty = useGuard(s => s.dirtyIds.has('meta'))
```

---

### `useGuardBlocker()`

Хук для кастомного UI блокера навигации. Возвращает объект `blocker` из TanStack Router.

```tsx
const blocker = useGuardBlocker()
```

| `blocker.*`  | Тип        | Описание |
|--------------|------------|----------|
| `status`     | `'idle' \| 'blocked'` | `'blocked'` когда навигация перехвачена |
| `proceed()`  | `() => void` | Разрешить переход (пользователь подтвердил) |
| `reset()`    | `() => void` | Отменить переход (пользователь остался) |

**Пример — кастомная модалка:**

```tsx
// Компонент должен находиться ВНУТРИ <DirtyGuardProvider>
function NavigationGuard() {
  const blocker = useGuardBlocker()

  if (blocker.status !== 'blocked') return null

  return (
    <Dialog open>
      <DialogTitle>Есть несохранённые изменения</DialogTitle>
      <DialogDescription>
        Если вы покинете страницу, изменения будут потеряны.
      </DialogDescription>
      <DialogFooter>
        <Button variant="ghost" onClick={blocker.reset}>
          Остаться
        </Button>
        <Button variant="destructive" onClick={blocker.proceed}>
          Покинуть
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// Использование
function EditorPage() {
  return (
    <DirtyGuardProvider>
      <DirtyProvider<Meta> id="meta" initial={metaData}>
        <MetaSection />
      </DirtyProvider>
      <NavigationGuard />
    </DirtyGuardProvider>
  )
}
```

> `useGuardBlocker` и встроенный `GuardBlockerEffect` могут сосуществовать — оба вызывают `useBlocker`. TanStack Router обработает это корректно. Но с UX-точки зрения имеет смысл использовать что-то одно.

---

## Блокировка закрытия вкладки

Встроенный `GuardBlockerEffect` автоматически добавляет слушатель `beforeunload`. Если в гварде есть грязные секции — браузер покажет стандартное системное предупреждение при попытке закрыть вкладку или перезагрузить страницу. Отдельно ничего настраивать не нужно.

---

## Вложенные гварды

Гварды можно вкладывать. Каждый гвард видит только те `DirtyProvider`, которые находятся в его поддереве и не перекрыты вложенным гвардом.

```tsx
// Внешний гвард — видит секции "profile" и "settings"
<DirtyGuardProvider>
  <DirtyProvider<Profile> id="profile" initial={profileData}>
    <ProfileSection />
  </DirtyProvider>

  {/* Вложенный гвард — видит только "payment" */}
  <DirtyGuardProvider confirmMessage="Не сохранить платёжные данные?">
    <DirtyProvider<Payment> id="payment" initial={paymentData}>
      <PaymentSection />
    </DirtyProvider>
  </DirtyGuardProvider>

  <DirtyProvider<Settings> id="settings" initial={settingsData}>
    <SettingsSection />
  </DirtyProvider>
</DirtyGuardProvider>
```

В примере выше:
- Внешний гвард отслеживает `"profile"` и `"settings"`.
- Внутренний гвард отслеживает только `"payment"` и показывает своё сообщение при навигации.
- `DirtyProvider id="payment"` регистрируется во **внутреннем** гварде — ближайшем в дереве.

---

## DirtyProvider без гварда

Если `DirtyProvider` не находится внутри `DirtyGuardProvider` — он работает автономно. Prop `id` в этом случае ни на что не влияет, его можно не передавать.

```tsx
// Полностью автономный провайдер — без блокировки навигации
<DirtyProvider<Document> initial={docData}>
  <DocumentForm />
</DirtyProvider>
```

---

## Ограничения

- `useGuardState` и `useGuard` работают **только внутри** `<DirtyGuardProvider>`. За его пределами — ошибка.
- `useGuardBlocker` требует TanStack Router в дереве (`RouterProvider`).
- Блокировка `beforeunload` работает только пока компонент с `DirtyGuardProvider` смонтирован.
- Гвард отслеживает секции **поверхностно** — только факт наличия изменений (`isDirty`), не сами данные. Чтобы получить данные секции — используй `useDirtyStore` внутри неё.
