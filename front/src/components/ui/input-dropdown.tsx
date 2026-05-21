import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { Text, useLayerTokens, useNextLayerTokens } from "@miracle/aramid"

import { inputVariants, type BaseInputProps } from "@/components/ui/input-variants"
import { useFieldLayerStyle } from "@/lib/use-field-layer-style"
import { cn } from "@/lib/utils"

import "@/design/input.css"
import "@/design/input-dropdown.css"

type InputDropdownProps<T> = BaseInputProps & {
  items: T[]
  value?: T | null
  defaultValue?: T | null
  onChange?: (value: T | null) => void
  getItemKey: (item: T) => string
  renderListItem: (item: T | null, state: { isSelected: boolean; isActive: boolean; index: number }) => React.ReactNode
  renderSelectedItem?: ((item: T | null) => React.ReactNode) | null
  className?: string
  children: React.ReactNode
}

type InputDropdownSelectedProps = Omit<React.HTMLAttributes<HTMLButtonElement>, "children">

type InputDropdownListProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  emptyText?: React.ReactNode
}

type DropdownContextValue<T> = {
  items: T[]
  options: Array<T | null | undefined>
  value: T | null
  isOpen: boolean
  activeIndex: number
  disabled: boolean
  size: BaseInputProps["size"]
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
  const size = props.size
  const full = props.full ?? false
  const label = props.label
  const helperText = props.helperText
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
      if (isSameValue(selected, nextValue)) return
      if (!isControlled) setInternalValue(nextValue)
      onChange?.(nextValue)
    },
    [isSameValue, selected, isControlled, onChange]
  )

  const selectedIndex = React.useMemo(() => {
    if (selected === null) return options.findIndex((item) => item == null)
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
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  const selectByIndex = React.useCallback(
    (index: number) => {
      const option = options[index]
      if (disabled || option === undefined) return
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
      items, options, value: selected, isOpen, activeIndex, disabled, size,
      getItemKey, renderListItem, renderSelectedItem, listId, triggerId,
      setIsOpen, setActiveIndex, selectByIndex, toggleOpen,
    }),
    [
      items, options, selected, isOpen, activeIndex, disabled, size,
      getItemKey, renderListItem, renderSelectedItem, listId, triggerId,
      selectByIndex, toggleOpen,
    ]
  )

  const wrap = (
    <div ref={rootRef} className={cn("input-wrap", full && "input-wrap--full", className)}>
      {children}
    </div>
  )

  if (label || helperText) {
    return (
      <DropdownContext.Provider value={contextValue as DropdownContextValue<unknown>}>
        <div className="input-field">
          {label && <Text.Helper as="span">{label}</Text.Helper>}
          {wrap}
          {helperText && <Text.Helper as="span" className="field-helper-text">{helperText}</Text.Helper>}
        </div>
      </DropdownContext.Provider>
    )
  }

  return (
    <DropdownContext.Provider value={contextValue as DropdownContextValue<unknown>}>
      {wrap}
    </DropdownContext.Provider>
  )
}

function InputDropdownSelected<T>({
  className,
  onKeyDown,
  onClick,
  style,
  ...props
}: InputDropdownSelectedProps) {
  const {
    options, value, isOpen, activeIndex, disabled, size,
    getItemKey, renderSelectedItem, listId, triggerId,
    setIsOpen, setActiveIndex, selectByIndex, toggleOpen,
  } = useDropdownContext<T>()

  const hasValue = value != null
  const fieldStyle = useFieldLayerStyle({ disabled, style })

  return (
    <button
      {...props}
      id={triggerId}
      type="button"
      disabled={disabled}
      style={fieldStyle}
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
          if (!isOpen) setIsOpen(true)
          else setActiveIndex(Math.min(activeIndex + 1, options.length - 1))
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          if (!isOpen) setIsOpen(true)
          else setActiveIndex(Math.max(activeIndex - 1, 0))
        } else if (event.key === "Enter") {
          if (!isOpen) { event.preventDefault(); setIsOpen(true) }
          else if (activeIndex >= 0) { event.preventDefault(); selectByIndex(activeIndex) }
        } else if (event.key === "Escape") {
          if (isOpen) { event.preventDefault(); setIsOpen(false) }
        }
        onKeyDown?.(event)
      }}
      className={cn(
        inputVariants({ size, full: true }),
        "input-dropdown-trigger",
        !hasValue && "input-dropdown-trigger--empty",
        className
      )}
    >
      <span>{renderSelectedItem ? renderSelectedItem(value) : (value == null ? "" : getItemKey(value))}</span>
      <span aria-hidden="true" className={cn("input-dropdown-chevron", isOpen && "input-dropdown-chevron--open")}>
        <ChevronDownIcon size={14} />
      </span>
    </button>
  )
}

function InputDropdownList<T>({
  className,
  emptyText = "No options",
  onMouseDown,
  style,
  ...props
}: InputDropdownListProps) {
  const { options, value, isOpen, activeIndex, getItemKey, renderListItem, listId, setActiveIndex, selectByIndex } =
    useDropdownContext<T>()

  const { layerBackground } = useNextLayerTokens()
  const { fieldBackground } = useLayerTokens()

  if (!isOpen) return null

  return (
    <div
      {...props}
      id={listId}
      role="listbox"
      onMouseDown={(event) => {
        event.preventDefault()
        onMouseDown?.(event)
      }}
      className={cn("input-dropdown-list", className)}
      style={{ backgroundColor: layerBackground, ...style }}
    >
      {options.length === 0 ? (
        <div className="input-dropdown-empty">{emptyText}</div>
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
              className={cn("input-dropdown-item", isActive && "input-dropdown-item--active")}
              style={isActive ? { backgroundColor: fieldBackground } : undefined}
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
