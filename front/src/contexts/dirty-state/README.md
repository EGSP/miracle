# dirty-state / dirty-guard

Механизм отслеживания несохранённых изменений в формах и секциях с опциональной блокировкой навигации.

---

## Из чего состоит

| Часть | Файл | Назначение |
|---|---|---|
| **DirtyState** | `DirtyStateContext.tsx` | Отслеживает изменения в одной форме или секции |
| **DirtyGuard** | `DirtyGuardContext.tsx` | Агрегирует несколько секций, блокирует навигацию |

Обе части независимы. `DirtyState` работает без `DirtyGuard`. `DirtyGuard` без хотя бы одного `DirtyProvider` с `id` ничего не отслеживает.

---

## Ключевые идеи

**Изоляция через Context + Zustand `createStore`.** Каждый `<DirtyProvider>` создаёт собственный стор в React-дереве — нет глобального стейта, нет утечек между страницами.

**Сравнение через `original` / `workingCopy`.** Стор хранит эталон (с сервера) и рабочую копию. При каждом изменении сравнивает их — если отличаются, `isDirty: true`.

**Автоматическая регистрация в гварде.** `<DirtyProvider id="...">` сам регистрируется в ближайшем `<DirtyGuardProvider>` при появлении изменений и снимает регистрацию при сбросе или размонтировании.

**Плоские объекты.** Сравнение работает через `===` на уровне ключей — вложенные объекты и массивы сравниваются по ссылке. Для сложных структур разбивай на несколько плоских `<DirtyProvider>`.

---

## Справка по API

### DirtyState

| Экспорт | Уровень | Когда использовать |
|---|---|---|
| `<DirtyProvider initial id? reinitializeOnChange?>` | — | Всегда — оборачивает секцию |
| `useField<T, K>(key)` | **Tier 1** | Биндинг поля: `value`, `isDirty`, `onChange`, `onInputChange` |
| `useDirtyStore<T, R>(selector)` | **Tier 2** | Всё остальное: флаги, экшены, рабочая копия |
| `useDirtyStoreApi<T>()` | **Tier 2** | Сырой `StoreApi` для `getState()` в обработчиках |
| `DirtyStore<T>` | тип | Тип стора |
| `DirtyStoreApi<T>` | тип | Тип StoreApi |

### DirtyGuard

| Экспорт | Уровень | Когда использовать |
|---|---|---|
| `<DirtyGuardProvider confirmMessage? skipBuiltinBlocker?>` | — | Всегда — оборачивает страницу |
| `useGuardState()` | **Tier 1** | `isDirtyAnywhere`, `dirtyIds`, `dirtyCount`, `isDirty(id)` |
| `useGuardActions()` | **Tier 1** | `commitAll()`, `resetAll()` после сохранения |
| `useGuardBlocker()` | **Tier 2** | Кастомная модалка вместо `window.confirm` |

---

## Быстрый выбор

| Ситуация | Решение |
|---|---|
| Одна форма, не нужна блокировка навигации | `<DirtyProvider>` + `useField` |
| Индикатор изменений в шапке той же секции | `useDirtyStore(s => s.isDirty)` в любом дочернем компоненте |
| Кнопка сохранения с данными из стора | `useDirtyStoreApi` + `getState()` в обработчике |
| Несколько форм, каждая сохраняется отдельно | Несколько изолированных `<DirtyProvider>` без гварда |
| Глобальный индикатор или кнопка "Сохранить всё" | `<DirtyGuardProvider>` + `<DirtyProvider id="...">` + `useGuardState` |
| Заблокировать навигацию через `window.confirm` | `<DirtyGuardProvider confirmMessage="...">` |
| Заблокировать навигацию через кастомный диалог | `<DirtyGuardProvider skipBuiltinBlocker>` + `useGuardBlocker` |
| Сбросить/закоммитить все секции разом | `useGuardActions()` → `resetAll()` / `commitAll()` |
| Вложенные структуры (массивы, объекты в объектах) | Несколько плоских `<DirtyProvider>` с разными `id` |

---

## Правила использования

```tsx
// ✅ Поле — всегда useField
const field = useField<T, 'name'>('name')
<input value={field.value} onChange={field.onInputChange} />

// ✅ Флаг isDirty — через selector, не подписываться на workingCopy
const isDirty = useDirtyStore<T, boolean>(s => s.isDirty)

// ✅ Данные для сохранения — читать в обработчике через getState(), не реактивно
const storeApi = useDirtyStoreApi<T>()
const handleSave = () => {
    const { workingCopy, commit } = storeApi.getState()
    mutate(workingCopy, { onSuccess: commit })
}

// ❌ Не читать workingCopy реактивно если нужен только в обработчике
const workingCopy = useDirtyStore(s => s.workingCopy)  // подписка на каждый keypress
const handleSave = () => mutate(workingCopy)             // плохо для больших форм
```

---

## Подробная документация

- [DirtyState.md](./DirtyState.md) — стор, хуки, примеры с нативными и кастомными компонентами
- [DirtyGuard.md](./DirtyGuard.md) — гвард, вложенность, блокировка навигации, сложные структуры
