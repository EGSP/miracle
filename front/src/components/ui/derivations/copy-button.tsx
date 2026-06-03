import { ClipboardCopy, StickyNote, StickyNotes } from "lucide-react"
import type * as React from "react"
import { Button, type ButtonProps } from "@/components/ui/ds/button"
import type { ButtonSize } from "@/components/ui/ds/button-variants"
import { copyTextWithExecCommand } from "@/lib/copy-text"

export type CopyButtonProps = Omit<ButtonProps, "variant" | "icon" | "label" | "children"> & {
  /** Строка, которую нужно скопировать в буфер обмена. */
  text: string
  size?: ButtonSize
  /** Подпись для screen reader (`aria-label`). По умолчанию — «Копировать». */
  label?: string
  /** После попытки копирования; `success` — результат `document.execCommand('copy')`. */
  onCopy?: (success: boolean) => void
}

function CopyButton({
  text,
  size = "md",
  label = "Копировать",
  onCopy,
  onClick,
  className,
  ...props
}: CopyButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const success = copyTextWithExecCommand(text)
    onCopy?.(success)
    onClick?.(event)
  }

  return (
    <Button
      type="button"
      variant="icon-button"
      size={size}
      className={className}
      icon={<StickyNotes />}
      label={label}
      onClick={handleClick}
      {...props}
    />
  )
}

export { CopyButton }
