import { Text, useLayerTokens, useNextLayerTokens } from "@miracle/aramid"
import * as React from "react"

import { type BaseInputProps, inputVariants } from "./input-variants"
import { useFieldLayerStyle } from "@/lib/use-field-layer-style"
import { cn } from "@/lib/utils"

import "@/design/input.css"
import "@/design/input-suggest.css"

type SuggestItemRenderer<T> = (
  item: T,
  state: { isActive: boolean; index: number },
) => React.ReactNode

type InputSuggestProps<T> = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "value" | "onChange" | "onSelect"
> &
  BaseInputProps & {
    value: string
    onChange: (value: string) => void
    onSearch: (query: string) => T[] | Promise<T[]>
    onSelect?: (item: T) => void
    renderItem?: SuggestItemRenderer<T>
    getItemValue: (item: T) => string
    loading?: boolean
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
  size,
  fluid = false,
  label,
  helperText,
  style,
  ...props
}: InputSuggestProps<T>) {
  const fieldStyle = useFieldLayerStyle({ disabled })
  const { layerBackground } = useNextLayerTokens()
  const { fieldBackground } = useLayerTokens()

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
        if (searchId !== searchIdRef.current) return
        setItems(nextItems)
        setActiveIndex(nextItems.length ? 0 : -1)
      } finally {
        if (searchId === searchIdRef.current) setIsInternalLoading(false)
      }
    }, debounceMs)
    return () => window.clearTimeout(timer)
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
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [clearBlurTimeout])

  React.useEffect(() => () => clearBlurTimeout(), [clearBlurTimeout])

  const selectItem = React.useCallback(
    (item: T) => {
      onChange(getItemValue(item))
      onSelect?.(item)
      setIsFocused(false)
      setActiveIndex(-1)
    },
    [getItemValue, onChange, onSelect],
  )

  return (
    <div
      className={cn("input-field", fluid && "input-field--fluid", className)}
      style={style}
    >
      {label && <Text.Helper as="span">{label}</Text.Helper>}
      <div ref={rootRef} className="input-wrap">
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
            blurTimeoutRef.current = window.setTimeout(() => setIsFocused(false), 150)
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
                if (selected) selectItem(selected)
              }
            } else if (event.key === "Escape") {
              setIsFocused(false)
              setActiveIndex(-1)
            }
            onKeyDown?.(event)
          }}
          className={inputVariants({ size })}
          style={fieldStyle}
        />

        {isOpen && (
          <div
            role="listbox"
            className="input-suggest-list"
            style={{ backgroundColor: layerBackground }}
          >
            {items.map((item, index) => {
              const isActive = index === activeIndex
              return (
                <div
                  key={`${getItemValue(item)}-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(item)}
                  className={cn("input-suggest-item", isActive && "input-suggest-item--active")}
                  style={isActive ? { backgroundColor: fieldBackground } : undefined}
                >
                  {renderItem ? renderItem(item, { isActive, index }) : getItemValue(item)}
                </div>
              )
            })}
          </div>
        )}

        {isFocused && isLoading && (
          <div className="input-suggest-loading">Loading suggestions...</div>
        )}
      </div>
      {helperText && (
        <Text.Helper as="span" className="field-helper-text">
          {helperText}
        </Text.Helper>
      )}
    </div>
  )
}

export type { InputSuggestProps }
export { InputSuggest }
