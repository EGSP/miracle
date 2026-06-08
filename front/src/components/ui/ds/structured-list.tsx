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
 * Ховер обрабатывается CSS `:hover`.
 *
 * ## Disabled
 *
 * - `disabled` на компоненте — отключает весь список.
 * - `definition.itemDisabled(item)` — отключает конкретный элемент.
 *
 * ## Высота строк
 *
 * - Default: 48px (`--structured-list-row-h`)
 * - `condensed`: 32px
 *
 * ## Overflow
 *
 * `overflow` ограничивает прокручиваемую область: заголовок и строки в одном
 * scroll-контейнере с `scrollbar-gutter: stable`, заголовок — `position: sticky`.
 * Колонки header и строк выровнены; видимых строк данных — значение `overflow`.
 *
 * ## Layering
 *
 * Фон выбранных элементов берётся через `useNextLayerTokens().layerBackground`,
 * чтобы корректно учитывать глубину слоя Aramid.
 */

import { useLayerTokens, useNextLayerTokens } from "@miracle/aramid"
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useLayoutEffect,
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

type StructuredListContextValue<T> = {
  definition: ListDefinition<T>
  normalizedColumns: NormalizedColumn<T>[]
  gridTemplate: string
  selected: StructuredListKey[]
  toggle: (item: T) => void
  multiselect: boolean
  disabled: boolean
  selectedBackground: string
  headerRef: RefObject<HTMLDivElement | null>
  stickyHeader: boolean
  headerBackground: string
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
   * Ограничивает прокручиваемую область количеством видимых строк данных.
   * Заголовок sticky внутри той же области. Поддерживаемые значения: 8, 12, 16.
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
  const { layerBackground } = useNextLayerTokens()
  const { layerBackground: headerBackground } = useLayerTokens()
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

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
      if (definition.itemDisabled?.(item)) return
      const key = definition.getKey(item)
      if (multiselect) {
        const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
        onSelected?.(next)
      } else {
        onSelected?.(selected.includes(key) ? [] : [key])
      }
    },
    [definition, disabled, multiselect, onSelected, selected],
  )

  useLayoutEffect(() => {
    if (!overflow) return
    const header = headerRef.current
    const scroll = scrollRef.current
    if (!header || !scroll) return

    const syncHeaderSize = () => {
      scroll.style.setProperty("--structured-list-header-block-size", `${header.offsetHeight}px`)
    }

    syncHeaderSize()
    const observer = new ResizeObserver(syncHeaderSize)
    observer.observe(header)
    return () => observer.disconnect()
  }, [overflow, normalizedColumns, items.length])

  const contextValue = useMemo<StructuredListContextValue<T>>(
    () => ({
      definition,
      normalizedColumns,
      gridTemplate,
      selected,
      toggle,
      multiselect,
      disabled,
      selectedBackground: layerBackground,
      headerRef,
      stickyHeader: Boolean(overflow),
      headerBackground,
    }),
    [
      definition,
      normalizedColumns,
      gridTemplate,
      selected,
      toggle,
      multiselect,
      disabled,
      layerBackground,
      overflow,
      headerBackground,
    ],
  )

  const rootStyle = overflow
    ? ({ "--structured-list-overflow-rows": String(overflow) } as CSSProperties)
    : undefined

  return (
    <StructuredListContext.Provider value={contextValue as StructuredListContextValue<unknown>}>
      <div
        className={cn(
          "structured-list",
          condensed && "structured-list--condensed",
          className,
        )}
        style={rootStyle}
        data-disabled={disabled || undefined}
      >
        <div
          ref={scrollRef}
          className={cn(
            "structured-list-scroll",
            overflow && "structured-list-scroll--overflow",
          )}
        >
          <StructuredListHeader<T> />
          <div className="structured-list-body" role="list">
            {items.map((item) => (
              <StructuredListItem<T> key={String(definition.getKey(item))} item={item} />
            ))}
          </div>
        </div>
      </div>
    </StructuredListContext.Provider>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function StructuredListHeader<T>() {
  const {
    normalizedColumns,
    gridTemplate,
    multiselect,
    headerRef,
    stickyHeader,
    headerBackground,
  } = useStructuredListContext<T>()

  return (
    <div
      ref={headerRef}
      className={cn("structured-list-header", stickyHeader && "structured-list-header--sticky")}
      style={{
        gridTemplateColumns: gridTemplate,
        backgroundColor: stickyHeader ? headerBackground : undefined,
      }}
      aria-hidden="true"
    >
      {multiselect && <div className="structured-list-header-cell" />}
      {normalizedColumns.map((col) => (
        <div key={col.key} className="structured-list-header-cell">
          {col.rows.length === 1 ? (
            (col.rows[0]!.label ?? null)
          ) : (
            <div className="structured-list-cell-inner">
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

function StructuredListItem<T>({ item }: { item: T }) {
  const {
    definition,
    normalizedColumns,
    gridTemplate,
    selected,
    toggle,
    multiselect,
    disabled,
    selectedBackground,
  } = useStructuredListContext<T>()

  const key = definition.getKey(item)
  const isSelected = selected.includes(key)
  const isItemDisabled = Boolean(disabled || definition.itemDisabled?.(item))

  return (
    <div
      role="listitem"
      aria-selected={isSelected}
      aria-disabled={isItemDisabled || undefined}
      data-selected={isSelected || undefined}
      data-disabled={isItemDisabled || undefined}
      className="structured-list-item"
      style={{
        gridTemplateColumns: gridTemplate,
        backgroundColor: isSelected ? selectedBackground : undefined,
      }}
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
