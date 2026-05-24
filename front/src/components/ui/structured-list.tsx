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
 *
 * ## Высота строк
 *
 * - Default: 60px (`--structured-list-row-h`)
 * - `condensed`: 36px
 *
 * ## Layering
 *
 * Фон выбранных элементов берётся через `useNextLayerTokens().layerBackground`,
 * чтобы корректно учитывать глубину слоя Aramid.
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useNextLayerTokens } from '@miracle/aramid'
import { cn } from '@/lib/utils'
import '@/design/structured-list.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StructuredListKey = string | number

export type ColumnWidth =
  | '1fr' | '2fr' | '4fr' | '6fr' | '8fr' | '12fr' | '16fr'
  | (string & {})

export type RowWeight = '1fr' | '2fr'

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
  if ('rows' in col) return col
  return {
    key: col.key,
    width: col.width,
    rows: [{ key: 'default', label: col.label, weight: '1fr', render: col.render }],
  }
}

function buildGridTemplate(cols: Array<{ width: ColumnWidth }>, multiselect: boolean): string {
  return [...(multiselect ? ['40px'] : []), ...cols.map((c) => c.width)].join(' ')
}

// ─── Context ──────────────────────────────────────────────────────────────────

type StructuredListContextValue<T> = {
  definition: ListDefinition<T>
  normalizedColumns: NormalizedColumn<T>[]
  gridTemplate: string
  selected: StructuredListKey[]
  activeIndex: number | null
  setActiveIndex: (i: number | null) => void
  toggle: (item: T) => void
  getItemId: (item: T) => string
  multiselect: boolean
  disabled: boolean
  selectedBackground: string
}

const StructuredListContext = createContext<StructuredListContextValue<unknown> | null>(null)

function useStructuredListContext<T>() {
  const ctx = useContext(StructuredListContext)
  if (!ctx) throw new Error('useStructuredListContext must be used within StructuredList')
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
  /** condensed: высота строки 36px, default: 60px */
  condensed?: boolean
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
  disabled = false,
  className,
}: StructuredListProps<T>) {
  const listId = useId()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const { layerBackground } = useNextLayerTokens()

  const onSelectedRef = useRef(onSelected)
  onSelectedRef.current = onSelected

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
        const next = selected.includes(key)
          ? selected.filter((k) => k !== key)
          : [...selected, key]
        onSelectedRef.current?.(next)
      } else {
        onSelectedRef.current?.(selected.includes(key) ? [] : [key])
      }
    },
    [disabled, definition, multiselect, selected],
  )

  const getItemId = useCallback(
    (item: T) =>
      `${listId}-option-${encodeURIComponent(String(definition.getKey(item)))}`,
    [listId, definition],
  )

  const move = (delta: number) => {
    if (!items.length) return
    const next =
      activeIndex === null
        ? 0
        : Math.min(Math.max(activeIndex + delta, 0), items.length - 1)
    setActiveIndex(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        if (items.length) setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        if (items.length) setActiveIndex(items.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (activeIndex !== null) {
          const item = items[activeIndex]
          if (item) toggle(item)
        }
        break
    }
  }

  const activeKey =
    activeIndex !== null && items[activeIndex]
      ? String(definition.getKey(items[activeIndex]!))
      : null

  const contextValue = useMemo<StructuredListContextValue<T>>(
    () => ({
      definition,
      normalizedColumns,
      gridTemplate,
      selected,
      activeIndex,
      setActiveIndex,
      toggle,
      getItemId,
      multiselect,
      disabled,
      selectedBackground: layerBackground,
    }),
    [definition, normalizedColumns, gridTemplate, selected, activeIndex, toggle, getItemId, multiselect, disabled, layerBackground],
  )

  return (
    <StructuredListContext.Provider value={contextValue as StructuredListContextValue<unknown>}>
      <div
        role="listbox"
        aria-multiselectable={multiselect || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        aria-activedescendant={
          activeKey ? `${listId}-option-${encodeURIComponent(activeKey)}` : undefined
        }
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (disabled || activeIndex !== null || !items.length) return
          setActiveIndex(0)
        }}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setActiveIndex(null)
        }}
        className={cn('structured-list', condensed && 'structured-list--condensed', className)}
      >
        <StructuredListHeader<T> />
        {items.map((item, index) => (
          <StructuredListItem<T>
            key={String(definition.getKey(item))}
            item={item}
            index={index}
          />
        ))}
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
            col.rows[0]!.label ?? null
          ) : (
            <div
              className="structured-list-cell-inner"
              style={{ gridTemplateRows: col.rows.map((r) => r.weight).join(' ') }}
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
    activeIndex,
    setActiveIndex,
    toggle,
    getItemId,
    multiselect,
    disabled,
    selectedBackground,
  } = useStructuredListContext<T>()

  const key = definition.getKey(item)
  const isSelected = selected.includes(key)
  const isActive = index === activeIndex
  const isItemDisabled = Boolean(disabled || definition.itemDisabled?.(item))

  return (
    <div
      id={getItemId(item)}
      role="option"
      aria-selected={isSelected}
      aria-disabled={isItemDisabled || undefined}
      data-selected={isSelected || undefined}
      data-active={isActive || undefined}
      data-disabled={isItemDisabled || undefined}
      className="structured-list-item"
      style={{
        gridTemplateColumns: gridTemplate,
        backgroundColor: isSelected ? selectedBackground : undefined,
      }}
      onMouseEnter={() => {
        if (!disabled && !isItemDisabled) setActiveIndex(index)
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
            'structured-list-cell',
            col.rows.length > 1 && 'structured-list-cell--multi',
          )}
        >
          {col.rows.length === 1 ? (
            col.rows[0]!.render(item)
          ) : (
            <div
              className="structured-list-cell-inner"
              style={{ gridTemplateRows: col.rows.map((r) => r.weight).join(' ') }}
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
