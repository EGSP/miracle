import * as React from "react"

import { cn } from "@/lib/utils"

type SuggestItemRenderer<T> = (item: T, state: { isActive: boolean; index: number }) => React.ReactNode

type InputSuggestProps<T> = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSelect"> & {
  /**
   * Текущее значение инпута (контролируемый режим).
   * Хранится во внешнем стейте, чтобы компонент можно было синхронизировать с формой/URL.
   * Пример: `value={searchQuery}`
   */
  value: string
  /**
   * Вызывается при любом изменении текста в инпуте.
   * Нужен для обновления внешнего `value` в контролируемом режиме.
   * Пример: `onChange={(next) => setSearchQuery(next)}`
   */
  onChange: (value: string) => void
  /**
   * Функция поиска подсказок по введенному запросу.
   * Может быть синхронной (`Item[]`) или асинхронной (`Promise<Item[]>`),
   * поэтому компонент не зависит от источника данных (API, локальный массив и т.д.).
   * Пример:
   * `onSearch={async (query) => api.orders.suggest({ query })}`
   */
  onSearch: (query: string) => T[] | Promise<T[]>
  /**
   * Колбэк выбора элемента из списка подсказок.
   * Вызывается после подстановки значения в инпут, если нужно сохранить выбранный объект целиком.
   * Пример: `onSelect={(order) => setSelectedOrder(order)}`
   */
  onSelect?: (item: T) => void
  /**
   * Кастомный рендер элемента подсказки.
   * Используйте, когда нужно отрисовать не просто строку, а сложный UI
   * (например, номер заказа + статус + дата).
   * Пример:
   * `renderItem={(item, { isActive }) => <OrderOption item={item} active={isActive} />}`
   */
  renderItem?: SuggestItemRenderer<T>
  /**
   * Извлекает строковое значение из элемента для подстановки в инпут при выборе.
   * Нужен, чтобы компонент работал с любым типом данных, а не только со строками.
   * Пример: `getItemValue={(order) => order.number}`
   */
  getItemValue: (item: T) => string
  /**
   * Внешний флаг загрузки.
   * Полезен, когда поиск управляется снаружи (например, через React Query),
   * и вы хотите явно передать состояние загрузки в компонент.
   * Пример: `loading={isFetchingOrders}`
   */
  loading?: boolean
  /**
   * Задержка (мс) перед вызовом `onSearch` после ввода.
   * Уменьшает число лишних запросов на каждый символ.
   * По умолчанию: `300`.
   * Пример: `debounceMs={500}`
   */
  debounceMs?: number
}

function InputSuggest<T>({
  value,
  onChange,
  onSearch,
  onSelect,
  renderItem,
  getItemValue,
  loading,
  debounceMs = 300,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  disabled,
  ...props
}: InputSuggestProps<T>) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const blurTimeoutRef = React.useRef<number | null>(null)
  const searchIdRef = React.useRef(0)

  const [items, setItems] = React.useState<T[]>([])
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const [isFocused, setIsFocused] = React.useState(false)
  const [isInternalLoading, setIsInternalLoading] = React.useState(false)

  const isLoading = loading ?? isInternalLoading
  const isOpen = isFocused && items.length > 0

  const clearBlurTimeout = React.useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
  }, [])

  React.useEffect(() => {
    const query = value.trim()

    if (!query) {
      setItems([])
      setActiveIndex(-1)
      setIsInternalLoading(false)
      return
    }

    const timer = window.setTimeout(async () => {
      const searchId = ++searchIdRef.current
      setIsInternalLoading(true)

      try {
        const nextItems = await Promise.resolve(onSearch(query))

        if (searchId !== searchIdRef.current) {
          return
        }

        setItems(nextItems)
        setActiveIndex(nextItems.length ? 0 : -1)
      } finally {
        if (searchId === searchIdRef.current) {
          setIsInternalLoading(false)
        }
      }
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [value, onSearch, debounceMs])

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return

      if (!rootRef.current.contains(event.target as Node)) {
        clearBlurTimeout()
        setIsFocused(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [clearBlurTimeout])

  React.useEffect(() => {
    return () => {
      clearBlurTimeout()
    }
  }, [clearBlurTimeout])

  const selectItem = React.useCallback(
    (item: T) => {
      const nextValue = getItemValue(item)
      onChange(nextValue)
      onSelect?.(item)
      setIsFocused(false)
      setActiveIndex(-1)
    },
    [getItemValue, onChange, onSelect]
  )

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        {...props}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          clearBlurTimeout()
          setIsFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          clearBlurTimeout()
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsFocused(false)
          }, 150)
          onBlur?.(event)
        }}
        onKeyDown={(event) => {
          if (isOpen && event.key === "ArrowDown") {
            event.preventDefault()
            setActiveIndex((prev) => Math.min(prev + 1, items.length - 1))
          } else if (isOpen && event.key === "ArrowUp") {
            event.preventDefault()
            setActiveIndex((prev) => Math.max(prev - 1, 0))
          } else if (isOpen && event.key === "Enter") {
            if (activeIndex >= 0 && activeIndex < items.length) {
              event.preventDefault()
              const selected = items[activeIndex]
              if (selected) {
                selectItem(selected)
              }
            }
          } else if (event.key === "Escape") {
            setIsFocused(false)
            setActiveIndex(-1)
          }

          onKeyDown?.(event)
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
      />

      {isOpen ? (
        <div
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-auto border border-input bg-background p-1 shadow-md"
        >
          {items.map((item, index) => {
            const isActive = index === activeIndex

            return (
              <div
                key={`${getItemValue(item)}-${index}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(event) => {
                  // Не даём полю потерять фокус до срабатывания обработчика клика.
                  event.preventDefault()
                }}
                onMouseEnter={() => {
                  setActiveIndex(index)
                }}
                onClick={() => {
                  selectItem(item)
                }}
                className={cn(
                  "cursor-pointer px-2 py-1 text-xs text-foreground",
                  isActive && "bg-muted"
                )}
              >
                {renderItem ? renderItem(item, { isActive, index }) : getItemValue(item)}
              </div>
            )
          })}
        </div>
      ) : null}

      {isFocused && isLoading ? (
        <div className="mt-1 text-[11px] text-muted-foreground">Loading suggestions...</div>
      ) : null}
    </div>
  )
}

export { InputSuggest }
export type { InputSuggestProps }
