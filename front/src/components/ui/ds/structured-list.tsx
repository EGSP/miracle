/**
 * StructuredList — типизированный список с колонками и строками внутри каждой колонки.
 * Адаптация паттерна Carbon Structured List под дизайн-систему Aramid.
 *
 * ## Структура колонок
 *
 * Каждая колонка задаётся через `ColumnDef<T>`:
 * - `ColumnDefWithRender` — одна строка (сахар): `{ key, label?, width, render }`.
 *   Эквивалентно `rows: [{ key: 'default', weight: '1fr', render }]`.
 * - `ColumnDefWithRows` — несколько строк: `{ key, width, rows[] }`.
 *   Строки делят высоту ячейки вертикально по `weight` (`grid-template-rows`).
 *   `label` у многострочной колонки отсутствует — каждая строка задаёт свой `label`.
 *
 * Заголовок строится автоматически из лейблов колонок/строк с теми же пропорциями,
 * что и ячейки данных.
 *
 * ## Выбор элементов
 *
 * Компонент всегда контролируемый — не управляет `selected` самостоятельно.
 * `onSelected` возвращает массив `StructuredListKey[]` (0, 1 или несколько ключей).
 * Потребитель обновляет `selected` снаружи.
 *
 * - Одиночный режим (по умолчанию): клик выбирает один элемент, повторный — снимает.
 *   Checkbox-индикатор не отображается.
 * - Мультиселект (`multiselect`): клик переключает элемент в массиве.
 *   Слева от каждой строки отображается декоративный checkbox.
 *
 * ## Disabled
 *
 * - `disabled` на компоненте — отключает весь список.
 * - `definition.itemDisabled(item)` — отключает конкретный элемент.
 *
 * ## Клавиатурная навигация
 *
 * Фокус на корневом элементе (`role="listbox"`), активный элемент управляется через
 * `aria-activedescendant`. Клавиши: `ArrowUp/Down`, `Home`, `End`, `Enter`/`Space`.
 * Состояние активного элемента (data-active) записывается напрямую в DOM — без
 * React-ре-рендеров. Ховер обрабатывается CSS `:hover`.
 *
 * ## Высота строк
 *
 * - Default: 48px (`--structured-list-row-h`)
 * - `condensed`: 32px
 *
 * ## Overflow
 *
 * `overflow` ограничивает прокручиваемую область строк количеством видимых
 * элементов. Заголовок остается вне скролла.
 *
 * ## Layering
 *
 * Фон выбранных элементов берётся через `useNextLayerTokens().layerBackground`,
 * чтобы корректно учитывать глубину слоя Aramid.
 */

import { useNextLayerTokens } from "@miracle/aramid"
import {
  createContext,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
} from "react"
import { cn } from "@/lib/utils"
import "@/design/structured-list.css"

// ─── Types ────────────────────────────────────────────────────────────────────

export type StructuredListKey = string | number

export type ColumnWidth = "1fr" | "2fr" | "4fr" | "6fr" | "8fr" | "12fr" | "16fr" | (string & {})

export type RowWeight = "1fr" | "2fr"

export type StructuredListOverflow = 8 | 12 | 16

export type ColumnRowDef<T> = {
  key: string
  /** Отображается в ячейке заголовка */
  label?: string
  weight: RowWeight
  render: (item: T) => ReactNode
}

/** Колонка с несколькими строками. label задаётся на уровне rows. */
export type ColumnDefWithRows<T> = {
  key: string
  width: ColumnWidth
  rows: ColumnRowDef<T>[]
}

/**
 * Колонка с одной строкой — сахар для rows: [{ key: 'default', weight: '1fr', render }].
 * label задаётся на уровне колонки, т.к. строка одна.
 */
export type ColumnDefWithRender<T> = {
  key: string
  label?: string
  width: ColumnWidth
  render: (item: T) => ReactNode
}

export type ColumnDef<T> = ColumnDefWithRows<T> | ColumnDefWithRender<T>

export type ListDefinition<T> = {
  getKey: (item: T) => StructuredListKey
  columns: ColumnDef<T>[]
  /** Возвращает true если item должен быть disabled */
  itemDisabled?: (item: T) => boolean
}

// ─── Internal ─────────────────────────────────────────────────────────────────

type NormalizedColumn<T> = {
  key: string
  width: ColumnWidth
  rows: ColumnRowDef<T>[]
}

function normalizeColumn<T>(col: ColumnDef<T>): NormalizedColumn<T> {
  if ("rows" in col) return col
  return {
    key: col.key,
    width: col.width,
    rows: [{ key: "default", label: col.label, weight: "1fr", render: col.render }],
  }
}

function buildGridTemplate(cols: Array<{ width: ColumnWidth }>, multiselect: boolean): string {
  return [...(multiselect ? ["40px"] : []), ...cols.map((c) => c.width)].join(" ")
}

// ─── Context ──────────────────────────────────────────────────────────────────
// activeIndex намеренно исключён из контекста — он меняется при каждом движении
// мышки/нажатии стрелки и вызвал бы ре-рендер всех итемов. Вместо этого
// data-active выставляется напрямую в DOM через moveToIndex().

type StructuredListContextValue<T> = {
  definition: ListDefinition<T>
  normalizedColumns: NormalizedColumn<T>[]
  gridTemplate: string
  selected: StructuredListKey[]
  toggle: (item: T) => void
  getItemId: (item: T) => string
  multiselect: boolean
  disabled: boolean
  selectedBackground: string
}

const StructuredListContext = createContext<StructuredListContextValue<unknown> | null>(null)

function useStructuredListContext<T>() {
  const ctx = useContext(StructuredListContext)
  if (!ctx) throw new Error("useStructuredListContext must be used within StructuredList")
  return ctx as StructuredListContextValue<T>
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type StructuredListProps<T> = {
  definition: ListDefinition<T>
  items: T[]
  /** Ключи выбранных элементов. Список всегда контролируемый — состояние снаружи. */
  selected?: StructuredListKey[]
  /** Вызывается при изменении выбора. Возвращает массив ключей (0, 1 или несколько). */
  onSelected?: (keys: StructuredListKey[]) => void
  /** Включает мультиселект: checkbox-индикатор слева, onSelected возвращает >1 */
  multiselect?: boolean
  /** condensed: высота строки 32px, default: 48px */
  condensed?: boolean
  /**
   * Ограничивает прокручиваемую область строк количеством видимых элементов.
   * Заголовок остается закрепленным над списком. Поддерживаемые значения: 8, 12, 16.
   */
  overflow?: StructuredListOverflow
  /** Полностью отключает список */
  disabled?: boolean
  className?: string
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function StructuredListRoot<T>({
  definition,
  items,
  selected = [],
  onSelected,
  multiselect = false,
  condensed = false,
  overflow,
  disabled = false,
  className,
}: StructuredListProps<T>) {
  const listId = useId()
  const { layerBackground } = useNextLayerTokens()

  // Refs для стабильных замыканий в обработчиках событий
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const activeElRef = useRef<Element | null>(null)
  const activeIndexRef = useRef<number | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const definitionRef = useRef(definition)
  definitionRef.current = definition
  const onSelectedRef = useRef(onSelected)
  onSelectedRef.current = onSelected

  // Записывает data-active напрямую в DOM — без React ре-рендеров
  const moveToIndex = useCallback((index: number | null) => {
    activeElRef.current?.removeAttribute("data-active")
    activeIndexRef.current = index

    if (index === null || !rootRef.current) {
      activeElRef.current = null
      rootRef.current?.removeAttribute("aria-activedescendant")
      return
    }

    const body = bodyRef.current
    if (!body) {
      activeElRef.current = null
      rootRef.current.removeAttribute("aria-activedescendant")
      return
    }

    const el = body.children[index]
    if (el) {
      el.setAttribute("data-active", "")
      activeElRef.current = el
      rootRef.current.setAttribute("aria-activedescendant", el.id)
      el.scrollIntoView({ block: "nearest" })
    }
  }, [])

  const normalizedColumns = useMemo(
    () => definition.columns.map((c) => normalizeColumn(c)),
    [definition.columns],
  )

  const gridTemplate = useMemo(
    () => buildGridTemplate(normalizedColumns, multiselect),
    [normalizedColumns, multiselect],
  )

  const toggle = useCallback(
    (item: T) => {
      if (disabled) return
      if (definitionRef.current.itemDisabled?.(item)) return
      const key = definitionRef.current.getKey(item)
      const cur = selectedRef.current
      if (multiselect) {
        const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
        onSelectedRef.current?.(next)
      } else {
        onSelectedRef.current?.(cur.includes(key) ? [] : [key])
      }
    },
    [disabled, multiselect],
  )

  const getItemId = useCallback(
    (item: T) => `${listId}-option-${encodeURIComponent(String(definition.getKey(item)))}`,
    [listId, definition],
  )

  const move = (delta: number) => {
    const cur = itemsRef.current
    if (!cur.length) return
    const next =
      activeIndexRef.current === null
        ? 0
        : Math.min(Math.max(activeIndexRef.current + delta, 0), cur.length - 1)
    moveToIndex(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        move(1)
        break
      case "ArrowUp":
        event.preventDefault()
        move(-1)
        break
      case "Home":
        event.preventDefault()
        if (itemsRef.current.length) moveToIndex(0)
        break
      case "End":
        event.preventDefault()
        if (itemsRef.current.length) moveToIndex(itemsRef.current.length - 1)
        break
      case "Enter":
      case " ":
        event.preventDefault()
        if (activeIndexRef.current !== null) {
          const item = itemsRef.current[activeIndexRef.current]
          if (item) toggle(item)
        }
        break
    }
  }

  const contextValue = useMemo<StructuredListContextValue<T>>(
    () => ({
      definition,
      normalizedColumns,
      gridTemplate,
      selected,
      toggle,
      getItemId,
      multiselect,
      disabled,
      selectedBackground: layerBackground,
    }),
    [
      definition,
      normalizedColumns,
      gridTemplate,
      selected,
      toggle,
      getItemId,
      multiselect,
      disabled,
      layerBackground,
    ],
  )

  const rootStyle = overflow
    ? ({ "--structured-list-overflow-rows": String(overflow) } as CSSProperties)
    : undefined

  return (
    <StructuredListContext.Provider value={contextValue as StructuredListContextValue<unknown>}>
      <div
        ref={rootRef}
        role="listbox"
        aria-multiselectable={multiselect || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (disabled || activeIndexRef.current !== null || !itemsRef.current.length) return
          const sel = selectedRef.current
          const def = definitionRef.current
          const firstSelected =
            sel.length > 0
              ? itemsRef.current.findIndex((item) => sel.includes(def.getKey(item)))
              : -1
          moveToIndex(firstSelected >= 0 ? firstSelected : 0)
        }}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          moveToIndex(null)
        }}
        className={cn(
          "structured-list",
          condensed && "structured-list--condensed",
          overflow && "structured-list--overflow",
          className,
        )}
        style={rootStyle}
      >
        <StructuredListHeader<T> />
        <div className="structured-list-body" ref={bodyRef}>
          {items.map((item, index) => (
            <StructuredListItem<T>
              key={String(definition.getKey(item))}
              item={item}
              index={index}
            />
          ))}
        </div>
      </div>
    </StructuredListContext.Provider>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function StructuredListHeader<T>() {
  const { normalizedColumns, gridTemplate, multiselect } = useStructuredListContext<T>()

  return (
    <div
      className="structured-list-header"
      style={{ gridTemplateColumns: gridTemplate }}
      aria-hidden="true"
    >
      {multiselect && <div className="structured-list-header-cell" />}
      {normalizedColumns.map((col) => (
        <div key={col.key} className="structured-list-header-cell">
          {col.rows.length === 1 ? (
            (col.rows[0]!.label ?? null)
          ) : (
            <div
              className="structured-list-cell-inner"
              style={{ gridTemplateRows: col.rows.map((r) => r.weight).join(" ") }}
            >
              {col.rows.map((row) => (
                <span key={row.key} className="structured-list-header-sub">
                  {row.label}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Item ─────────────────────────────────────────────────────────────────────

function StructuredListItem<T>({ item, index }: { item: T; index: number }) {
  const {
    definition,
    normalizedColumns,
    gridTemplate,
    selected,
    toggle,
    getItemId,
    multiselect,
    disabled,
    selectedBackground,
  } = useStructuredListContext<T>()

  const key = definition.getKey(item)
  const isSelected = selected.includes(key)
  const isItemDisabled = Boolean(disabled || definition.itemDisabled?.(item))

  return (
    <div
      id={getItemId(item)}
      role="option"
      aria-selected={isSelected}
      aria-disabled={isItemDisabled || undefined}
      data-selected={isSelected || undefined}
      data-disabled={isItemDisabled || undefined}
      className="structured-list-item"
      style={{
        gridTemplateColumns: gridTemplate,
        backgroundColor: isSelected ? selectedBackground : undefined,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!isItemDisabled) toggle(item)
      }}
    >
      {multiselect && (
        <div className="structured-list-checkbox-cell">
          <span
            className="structured-list-checkbox"
            data-checked={isSelected || undefined}
            aria-hidden="true"
          />
        </div>
      )}
      {normalizedColumns.map((col) => (
        <div
          key={col.key}
          className={cn(
            "structured-list-cell",
            col.rows.length > 1 && "structured-list-cell--multi",
          )}
        >
          {col.rows.length === 1 ? (
            col.rows[0]!.render(item)
          ) : (
            <div
              className="structured-list-cell-inner"
              style={{ gridTemplateRows: col.rows.map((r) => r.weight).join(" ") }}
            >
              {col.rows.map((row) => (
                <div key={row.key} className="structured-list-sub-cell">
                  {row.render(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export { StructuredListRoot as StructuredList }
