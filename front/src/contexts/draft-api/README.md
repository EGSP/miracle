# draft-api

Механизм сборки сложного объекта из плоских секций перед сохранением на сервер.

Каждая секция регистрирует хендлер, который патчит черновик своим слоем. Координатор запускает цепочку и получает итоговый объект.

---

## Концепция

```
collect({ ...order })
  → handler "file"  : { ...draft, fileId: "abc" }
  → handler "req-0" : { ...draft, requirements: [...] }
  → handler "req-1" : { ...draft, requirements: [..., req1] }
  → итог → мутация
```

Если хендлер возвращает `undefined` — цепочка прерывается, сохранение отменяется. Компонент сам показывает ошибку перед возвратом `undefined`.

---

## API

| Экспорт | Что делает |
|---|---|
| `DraftHandler<T>` | Тип хендлера: `(draft: T) => T \| undefined` |
| `DraftAPI<T>` | Интерфейс: `contribute`, `collect` |
| `useDraft<T>()` | Создаёт `DraftAPI` — вызывается в entity-провайдере |
| `useContribute(contribute, id, handler)` | Регистрирует хендлер компонента |

### `DraftAPI<T>`

| Метод | Сигнатура | Описание |
|---|---|---|
| `contribute` | `(id, handler) => () => void` | Зарегистрировать хендлер. Возвращает cleanup. |
| `collect` | `(base: T) => T \| undefined` | Запустить цепочку хендлеров |

---

## Подключение в entity-контекст

`useDraft<T>()` вызывается в провайдере, результат встраивается через spread.

```tsx
type OrderCardContextType = {
    order: Stored<Order>
    files: FileWithMeta[]
} & DraftAPI<Order>

const OrderCardContext = createContext<OrderCardContextType | null>(null)

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

`contribute` берётся из entity-контекста. TypeScript выводит `T` из типа `contribute` автоматически — аннотировать `draft` не нужно.

```tsx
function OrderCardFile() {
    const { contribute } = useOrderCardContext()
    const fileField = useField('fileId', '')

    useContribute(contribute, 'file', (draft) => {
        if (!fileField.value) return undefined  // отклонить
        return { ...draft, fileId: fileField.value }
    })

    return <FileSelector field={fileField} />
}
```

```tsx
function FileCardSettings() {
    const { contribute } = useFileCardContext()
    const activeField = useField('active', false)

    useContribute(contribute, 'settings', (draft) => ({
        ...draft,
        settings: { active: activeField.value },
    }))

    return <Switch checked={activeField.value} onCheckedChange={activeField.onChange} />
}
```

---

## Сохранение в координаторе

```tsx
function OrderCardBody() {
    const { order, collect } = useOrderCardContext()
    const { commitAll } = useGuardActions()
    const mutation = useUpdateOrder()

    const handleSave = () => {
        const result = collect({ ...order })
        if (result === undefined) return  // кто-то отклонил

        mutation.mutate(
            { id: order.id, ...result },
            { onSuccess: (saved) => { commitAll(); onOrderSaved(saved) } }
        )
    }
}
```

---

## Правила

**id стабильный.** При смене id хендлер перерегистрируется — используй константу.

**Каждый хендлер трогает только свой слой.** Не перезаписывай поля других секций.

**`undefined` = сохранение отклонено.** Хендлер показывает ошибку сам — координатор причину не знает.

**Порядок = порядок монтирования.** Если порядок важен — учитывай порядок mount компонентов.

---

## Связь с dirty-state

| | dirty-state | draft-api |
|---|---|---|
| Задача | Отслеживать изменения, блокировать навигацию | Собрать объект из секций для сохранения |
| Когда активен | Постоянно (реактивно) | Только в момент `collect` |

`commitAll()` из Guard вызывается после успешной мутации. `draft-api` к этому не причастен.
