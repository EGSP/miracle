# draft-api

Механизм сборки сложного объекта из плоских секций перед сохранением на сервер.

Каждая секция (компонент) регистрирует хендлер, который патчит черновик своим слоем данных. Координатор (entity-контекст) запускает цепочку и получает итоговый объект.

---

## Концепция

```
collect({ ...order })
  → handler "file"  : { ...draft, fileId: "abc" }
  → handler "req-0" : { ...draft, requirements: [...] }
  → handler "req-1" : { ...draft, requirements: [..., req1] }
  → итог передаётся в мутацию
```

Если хендлер возвращает `undefined` — цепочка прерывается, сохранение отменяется. Компонент сам решает как сообщить об ошибке пользователю перед возвратом `undefined`.

---

## API

| Экспорт | Что делает |
|---|---|
| `DraftHandler<T>` | Тип хендлера: `(draft: T) => T \| undefined` |
| `DraftAPI<T>` | Интерфейс: `contribute`, `collect` |
| `useDraft<T>()` | Создаёт `DraftAPI` — вызывается в entity-провайдере |
| `useContribute(Context, id, handler)` | Регистрирует хендлер компонента |

### `DraftAPI<T>`

| Метод | Сигнатура | Описание |
|---|---|---|
| `contribute` | `(id, handler) => () => void` | Зарегистрировать хендлер. Возвращает cleanup. |
| `collect` | `(base: T) => T \| undefined` | Запустить цепочку хендлеров |

---

## Подключение в entity-контекст

`useDraft<T>()` вызывается в провайдере, результат встраивается в контекст через spread.
Контекст должен иметь тип `{ ... } & DraftAPI<T>` — тогда `useContribute` его найдёт.

```tsx
// types
type OrderCardContextType = {
    order: Stored<Order>
    files: FileWithMeta[]
} & DraftAPI<Order>

const OrderCardContext = createContext<OrderCardContextType | null>(null)

// провайдер
function OrderCardProvider({ order, files, children }) {
    const draft = useDraft<Order>()

    return (
        <OrderCardContext.Provider value={{ order, files, ...draft }}>
            {children}
        </OrderCardContext.Provider>
    )
}
```

---

## Использование в компонентах

```tsx
function OrderCardFile() {
    const fileField = useField<OrderFileState, 'fileId'>('fileId')

    useContribute(OrderCardContext, 'file', (draft) => {
        if (!fileField.value) return undefined   // отклонить — файл не выбран
        return { ...draft, fileId: fileField.value }
    })

    return <FileSelector field={fileField} />
}
```

TypeScript выводит тип `draft` из `OrderCardContext` автоматически — явно указывать не нужно.

---

## Сохранение в координаторе

```tsx
function OrderCardBody() {
    const { order, collect } = useOrderCardContext()
    const { commitAll } = useGuardActions()
    const mutation = useUpdateOrder()

    const handleSave = () => {
        const result = collect({ ...order })
        if (result === undefined) return  // кто-то отклонил — компонент уже показал ошибку

        mutation.mutate(
            { id: order.id, ...result },
            { onSuccess: (saved) => { commitAll(); onOrderSaved(saved) } }
        )
    }
}
```

---

## Правила

**id должен быть стабильным.** При смене `id` хендлер переregisterируется — используй константу или `useMemo`.

**Каждый хендлер трогает только свой слой.** Не перезаписывай поля других секций.

**`undefined` = сохранение отклонено.** Хендлер обязан показать ошибку пользователю сам, до возврата `undefined` — координатор не знает причину.

**Порядок хендлеров = порядок регистрации (mount).** Если порядок важен — учитывай порядок монтирования компонентов.

---

## Связь с dirty-state

`draft-api` и `dirty-state` решают разные задачи и не зависят друг от друга:

| | dirty-state | draft-api |
|---|---|---|
| Задача | Отслеживать изменения, блокировать навигацию | Собрать объект из секций для сохранения |
| Когда активен | Всё время (реактивно) | Только в момент вызова `collect` |
| commit | `commitAll()` из Guard — после успеха мутации | — |

`commitAll()` из `DirtyGuard` вызывается после успешной мутации — он закрывает dirty-состояния всех секций. `draft-api` к этому не причастен.
