import * as React from "react"

import { cn } from "@/lib/utils"

type InputDropdownProps<T> = {
  /**
   * Набор элементов, доступных для выбора.
   * Компонент не ограничивает тип элемента: можно передавать любой объект.
   */
  items: T[]
  /**
   * Текущее выбранное значение (контролируемый режим).
   * Если передан, состояние выбора управляется снаружи.
   */
  value?: T | null
  /**
   * Начальное выбранное значение (неконтролируемый режим).
   * Полезно, когда значение уже известно и пользователь может не делать выбор вручную.
   */
  defaultValue?: T | null
  /**
   * Колбэк выбора элемента.
   * Возвращает типизированный объект, а не строку.
   */
  onChange?: (value: T | null) => void
  /**
   * Стабильный ключ для элемента.
   * Используется для React key, определения выбранного/активного пункта и aria-идентификаторов.
   */
  getItemKey: (item: T) => string
  /**
   * Рендер элемента в выпадающем списке.
   * Может вернуть любой ReactNode. На выбор и навигацию это не влияет.
   */
  renderListItem: (item: T | null, state: { isSelected: boolean; isActive: boolean; index: number }) => React.ReactNode
  /**
   * Рендер выбранного значения в кнопке Selected.
   * Если не передан, используется стандартный fallback-текст.
   */
  renderSelectedItem?: ((item: T | null) => React.ReactNode) | null
  /**
   * Блокировка интерактива.
   */
  disabled?: boolean
  /**
   * Обертка для всего dropdown-компонента.
   */
  className?: string
  children: React.ReactNode
}

type InputDropdownSelectedProps = Omit<React.HTMLAttributes<HTMLButtonElement>, "children">

type InputDropdownListProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  /**
   * Сообщение, если список пуст.
   */
  emptyText?: React.ReactNode
}

type DropdownContextValue<T> = {
  items: T[]
  options: Array<T | null | undefined>
  value: T | null
  isOpen: boolean
  activeIndex: number
  disabled: boolean
  getItemKey: (item: T) => string
  renderListItem: (item: T | null, state: { isSelected: boolean; isActive: boolean; index: number }) => React.ReactNode
  renderSelectedItem: ((item: T | null) => React.ReactNode) | null
  listId: string
  triggerId: string
  setIsOpen: (open: boolean) => void
  setActiveIndex: (index: number) => void
  selectByIndex: (index: number) => void
  toggleOpen: () => void
}

const DropdownContext = React.createContext<DropdownContextValue<unknown> | null>(null)

function useDropdownContext<T>() {
  const context = React.useContext(DropdownContext)
  if (!context) {
    throw new Error("Input.Dropdown compound components must be used within Input.Dropdown.")
  }
  return context as DropdownContextValue<T>
}

function InputDropdownRoot<T>({
  items,
  defaultValue = null,
  renderSelectedItem = null,
  ...props
}: InputDropdownProps<T>) {
  const isControlled = Object.prototype.hasOwnProperty.call(props, "value")
  const controlledValue = props.value ?? null
  const onChange = props.onChange
  const getItemKey = props.getItemKey
  const renderListItem = props.renderListItem
  const disabled = props.disabled ?? false
  const className = props.className
  const children = props.children

  const [internalValue, setInternalValue] = React.useState<T | null>(defaultValue ?? null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)

  const rootRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  const triggerId = React.useId()

  const selected = isControlled ? controlledValue : internalValue

  const options = React.useMemo<Array<T | null | undefined>>(() => {
    const hasEmptyInItems = items.some((item) => item == null)
    return hasEmptyInItems ? items : [null, ...items]
  }, [items])

  const isSameValue = React.useCallback(
    (left: T | null, right: T | null) => {
      if (left === right) return true
      if (left == null || right == null) return false
      return getItemKey(left) === getItemKey(right)
    },
    [getItemKey]
  )

  const setSelected = React.useCallback(
    (nextValue: T | null) => {
      if (isSameValue(selected, nextValue)) {
        return
      }
      if (!isControlled) {
        setInternalValue(nextValue)
      }
      onChange?.(nextValue)
    },
    [isSameValue, selected, isControlled, onChange]
  )

  const selectedIndex = React.useMemo(() => {
    if (selected === null) {
      return options.findIndex((item) => item == null)
    }

    return options.findIndex((item) => item != null && getItemKey(item) === getItemKey(selected))
  }, [options, selected, getItemKey])

  React.useEffect(() => {
    if (!isOpen) return
    const nextActiveIndex = selectedIndex >= 0 ? selectedIndex : options.length ? 0 : -1
    setActiveIndex((prev) => (prev === nextActiveIndex ? prev : nextActiveIndex))
  }, [isOpen, selectedIndex, options.length])

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen((prev) => (prev ? false : prev))
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [])

  const selectByIndex = React.useCallback(
    (index: number) => {
      const option = options[index]
      if (disabled) return
      if (option === undefined) return
      setSelected(option)
      setIsOpen((prev) => (prev ? false : prev))
    },
    [options, disabled, setSelected]
  )

  const toggleOpen = React.useCallback(() => {
    if (disabled) return
    setIsOpen((prev) => !prev)
  }, [disabled])

  const contextValue = React.useMemo<DropdownContextValue<T>>(
    () => ({
      items,
      options,
      value: selected,
      isOpen,
      activeIndex,
      disabled,
      getItemKey,
      renderListItem,
      renderSelectedItem,
      listId,
      triggerId,
      setIsOpen,
      setActiveIndex,
      selectByIndex,
      toggleOpen,
    }),
    [
      items,
      options,
      selected,
      isOpen,
      activeIndex,
      disabled,
      getItemKey,
      renderListItem,
      renderSelectedItem,
      listId,
      triggerId,
      selectByIndex,
      toggleOpen,
    ]
  )

  return (
    <DropdownContext.Provider value={contextValue as DropdownContextValue<unknown>}>
      <div ref={rootRef} className={cn("relative w-full", className)}>
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

function InputDropdownSelected<T>({
  className,
  onKeyDown,
  onClick,
  ...props
}: InputDropdownSelectedProps) {
  const {
    options,
    value,
    isOpen,
    activeIndex,
    disabled,
    getItemKey,
    renderSelectedItem,
    listId,
    triggerId,
    setIsOpen,
    setActiveIndex,
    selectByIndex,
    toggleOpen,
  } = useDropdownContext<T>()

  const hasValue = value != null

  return (
    <button
      {...props}
      id={triggerId}
      type="button"
      disabled={disabled}
      role="combobox"
      aria-expanded={isOpen}
      aria-controls={listId}
      aria-haspopup="listbox"
      aria-activedescendant={
        isOpen && activeIndex >= 0 && activeIndex < options.length
          ? options[activeIndex]
            ? `${listId}-option-${encodeURIComponent(getItemKey(options[activeIndex] as T))}`
            : undefined
          : undefined
      }
      onClick={(event) => {
        toggleOpen()
        onClick?.(event)
      }}
      onKeyDown={(event) => {
        if (disabled) return

        if (event.key === "ArrowDown") {
          event.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else {
            setActiveIndex(Math.min(activeIndex + 1, options.length - 1))
          }
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else {
            setActiveIndex(Math.max(activeIndex - 1, 0))
          }
        } else if (event.key === "Enter") {
          if (!isOpen) {
            event.preventDefault()
            setIsOpen(true)
          } else if (activeIndex >= 0) {
            event.preventDefault()
            selectByIndex(activeIndex)
          }
        } else if (event.key === "Escape") {
          if (isOpen) {
            event.preventDefault()
            setIsOpen(false)
          }
        }

        onKeyDown?.(event)
      }}
      className={cn(
        "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-left text-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        !hasValue && "text-muted-foreground",
        className
      )}
    >
      {renderSelectedItem ? renderSelectedItem(value) : <span>{value == null ? "" : getItemKey(value)}</span>}
    </button>
  )
}

function InputDropdownList<T>({
  className,
  emptyText = "No options",
  onMouseDown,
  ...props
}: InputDropdownListProps) {
  const { options, value, isOpen, activeIndex, getItemKey, renderListItem, listId, setActiveIndex, selectByIndex } =
    useDropdownContext<T>()

  if (!isOpen) return null

  return (
    <div
      {...props}
      id={listId}
      role="listbox"
      onMouseDown={(event) => {
        // Keep focus on Selected while choosing an option.
        event.preventDefault()
        onMouseDown?.(event)
      }}
      className={cn("absolute top-full z-50 mt-1 max-h-56 w-full overflow-auto border border-input bg-background p-1 shadow-md", className)}
    >
      {options.length === 0 ? (
        <div className="px-2 py-1 text-xs text-muted-foreground">{emptyText}</div>
      ) : (
        options.map((item, index) => {
          const isSelected = item == null ? value === null : value ? getItemKey(value) === getItemKey(item) : false
          const isActive = index === activeIndex

          return (
            <div
              key={item != null ? getItemKey(item) : index}
              id={item != null ? `${listId}-option-${encodeURIComponent(getItemKey(item))}` : undefined}
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectByIndex(index)}
              className={cn("cursor-pointer px-2 py-1 text-xs text-foreground", isActive && "bg-muted")}
            >
              {renderListItem(item ?? null, { isSelected, isActive, index })}
            </div>
          )
        })
      )}
    </div>
  )
}

type InputDropdownComponent = typeof InputDropdownRoot & {
  Selected: typeof InputDropdownSelected
  List: typeof InputDropdownList
}

const InputDropdown = Object.assign(InputDropdownRoot, {
  Selected: InputDropdownSelected,
  List: InputDropdownList,
}) as InputDropdownComponent

export { InputDropdown }
export type { InputDropdownProps, InputDropdownSelectedProps, InputDropdownListProps }
