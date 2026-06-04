import { Text, useNextLayerTokens } from "@miracle/aramid"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { type DragEvent, type ReactNode, useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { cn } from "@/lib/utils"
import "@/design/array-editor.css"

/** Стабильный ключ элемента массива. Используется для React key и controlled selection. */
export type ArrayEditorKey = string | number

/**
 * Props for {@link ArrayEditor}.
 *
 * Компонент управляет только списком элементов массива: отображает label-строки,
 * выбранный элемент, действия add/remove и reorder. Сам редактор выбранного
 * элемента остаётся ответственностью родителя.
 */
export type ArrayEditorProps<T> = {
  /** Элементы редактируемого массива в текущем порядке. */
  items: T[]

  /**
   * Возвращает стабильный ключ элемента.
   *
   * Для сущностей лучше использовать доменный id. Индекс допустим только для
   * простых массивов без стабильных id, где reorder/selection управляются родителем.
   */
  getKey: (item: T, index: number) => ArrayEditorKey

  /**
   * Рендерит содержимое кликабельной строки.
   *
   * Здесь стоит показывать короткое название/summary элемента, а не полную форму
   * редактирования. Форма выбранного элемента должна рендериться родителем.
   */
  renderLabel: (item: T, index: number) => ReactNode

  /** Ключ выбранного элемента. `null` означает, что ничего не выбрано. */
  selected?: ArrayEditorKey | null

  /** Вызывается при выборе строки или повторном клике по выбранной строке. */
  onSelected?: (key: ArrayEditorKey | null) => void

  /** Вызывается при нажатии кнопки добавления. Если не задан, кнопка не отображается. */
  onAdd?: () => void

  /** Вызывается при удалении элемента. Если не задан, кнопки удаления не отображаются. */
  onRemove?: (key: ArrayEditorKey, index: number) => void

  /**
   * Вызывается после drag-and-drop reorder.
   *
   * Если задан, компонент показывает grip-ручку и позволяет перетаскивать строки.
   */
  onMove?: (fromIndex: number, toIndex: number) => void

  /** Подпись поля, как у DS Input/Textarea. */
  label?: ReactNode

  /** Вспомогательный текст под списком, как у DS Input/Textarea. */
  helperText?: ReactNode

  /** Текст пустого состояния внутри списка. */
  emptyText?: ReactNode

  /** Текст кнопки добавления. */
  addLabel?: string

  /** Отключает выбор, добавление, удаление и reorder. */
  disabled?: boolean

  /** Растягивает компонент на ширину родителя. */
  fluid?: boolean

  /**
   * Явно включает или выключает reorder UI.
   *
   * По умолчанию reorder включается автоматически, когда передан `onMove`.
   */
  reorderable?: boolean

  /** Дополнительный класс корневого field-wrapper. */
  className?: string
}

export function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return items
  next.splice(toIndex, 0, item)
  return next
}

/**
 * ArrayEditor — controlled editable-list для массивов данных.
 *
 * Он похож визуально на `StructuredList`, но предназначен не для выбора записей
 * как конечного действия, а для управления ordered collection: выбрать элемент,
 * добавить, удалить или поменять порядок. Состояние выбранного элемента и
 * редактирование его полей контролируются родителем.
 */
export function ArrayEditor<T>({
  items,
  getKey,
  renderLabel,
  selected = null,
  onSelected,
  onAdd,
  onRemove,
  onMove,
  label,
  helperText,
  emptyText = "Нет элементов",
  addLabel = "Добавить",
  disabled,
  fluid = false,
  reorderable,
  className,
}: ArrayEditorProps<T>) {
  const { layerBackground } = useNextLayerTokens()
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const canReorder = Boolean((reorderable ?? Boolean(onMove)) && onMove && !disabled)

  const handleDrop = (toIndex: number) => {
    if (draggingIndex === null || draggingIndex === toIndex) return
    onMove?.(draggingIndex, toIndex)
  }

  const clearDragState = () => {
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className={cn("array-editor-field", fluid && "array-editor-field--fluid", className)}>
      {label && (
        <Text.Helper as="span" className="array-editor-label">
          {label}
        </Text.Helper>
      )}
      <div
        className={cn("array-editor", canReorder && "array-editor--reorderable")}
        aria-disabled={disabled || undefined}
        data-disabled={disabled || undefined}
      >
        <div className="array-editor-list" role="list">
          {items.length === 0 ? (
            <Text.Helper as="p" className="array-editor-empty">
              {emptyText}
            </Text.Helper>
          ) : (
            items.map((item, i) => {
              const key = getKey(item, i)
              const isSelected = selected === key

              return (
                <div
                  key={String(key)}
                  role="listitem"
                  className="array-editor-row"
                  data-selected={isSelected || undefined}
                  data-dragging={draggingIndex === i || undefined}
                  data-drag-over={dragOverIndex === i || undefined}
                  style={{ backgroundColor: isSelected ? layerBackground : undefined }}
                  onDragStart={(event: DragEvent<HTMLDivElement>) => {
                    if (!canReorder) return
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", String(i))
                    setDraggingIndex(i)
                  }}
                  onDragOver={(event) => {
                    if (!canReorder || draggingIndex === null) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    setDragOverIndex(i)
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === i) setDragOverIndex(null)
                  }}
                  onDrop={(event) => {
                    if (!canReorder) return
                    event.preventDefault()
                    handleDrop(i)
                    clearDragState()
                  }}
                  onDragEnd={clearDragState}
                >
                  {canReorder && (
                    <span className="array-editor-drag-handle" draggable aria-hidden="true">
                      <GripVertical />
                    </span>
                  )}
                  <button
                    type="button"
                    className="array-editor-row-label"
                    aria-pressed={isSelected}
                    disabled={disabled}
                    onClick={() => onSelected?.(isSelected ? null : key)}
                  >
                    {renderLabel(item, i)}
                  </button>
                  {onRemove && (
                    <Button
                      className="array-editor-remove"
                      variant="icon-button"
                      size="sm"
                      icon={<Trash2 />}
                      label="Удалить"
                      onClick={() => onRemove(key, i)}
                      disabled={disabled}
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
        {onAdd && (
          <Button
            variant="tertiary"
            size="md"
            icon={<Plus />}
            label={addLabel}
            onClick={onAdd}
            disabled={disabled}
            fluid
          />
        )}
      </div>
      {helperText && (
        <Text.Helper as="span" className="array-editor-helper-text field-helper-text">
          {helperText}
        </Text.Helper>
      )}
    </div>
  )
}
