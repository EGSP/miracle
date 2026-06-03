import { Stack } from "@miracle/aramid"
import { Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/ds/button"
import { cn } from "@/lib/utils"

type ArrayEditorProps<T> = {
  items: T[]
  onAdd: () => void
  onRemove: (index: number) => void
  renderItem: (item: T, index: number) => ReactNode
  addLabel?: string
  disabled?: boolean
  className?: string
}

export function ArrayEditor<T>({
  items,
  onAdd,
  onRemove,
  renderItem,
  addLabel = "Добавить",
  disabled,
  className,
}: ArrayEditorProps<T>) {
  return (
    <Stack gap={3} className={className}>
      {items.map((item, i) => (
        <div key={i} className="flex gap-1 items-end border border-border p-2">
          <div className="flex-1 min-w-0">{renderItem(item, i)}</div>
          <Button
            variant="icon-button"
            size="sm"
            icon={<Trash2 />}
            label="Удалить"
            onClick={() => onRemove(i)}
            disabled={disabled}
          />
        </div>
      ))}
      <Button
        variant="tertiary"
        size="md"
        icon={<Plus />}
        label={addLabel}
        onClick={onAdd}
        disabled={disabled}
        fluid
      />
    </Stack>
  )
}
