import { Layer, Text } from "@miracle/aramid"
import { XIcon } from "lucide-react"
import type { ReactNode } from "react"
import type * as React from "react"
import { useEffect, useRef } from "react"
import { Button } from "./button"
import { ButtonGroup } from "./button-group"
import type { ButtonVariant } from "./button-variants"
import "@/design/modal-dialog.css"

// ─── Public types ────────────────────────────────────────────────────────────

export interface DialogButtonConfig {
  label: string
  onClick: () => void
  variant?: ButtonVariant
  disabled?: boolean
  /** Trailing-иконка (как у Button). */
  icon?: ReactNode
}

export interface DialogProps {
  description?: string
  title: string
  size?: "sm" | "md" | "lg" | "xl"
  onClose: () => void
  /** Закрытие по Escape. Отдельно от `cancel` на `<dialog>` — отмена системного file picker не закрывает модалку. */
  closeOnEscape?: boolean
  actions?: DialogButtonConfig[]
  children?: React.ReactNode
}

// ─── Private subcomponents ───────────────────────────────────────────────────

interface PrivateHeaderProps {
  description?: string
  title: string
  onClose: () => void
}

function PrivateHeader({ description, title, onClose }: PrivateHeaderProps) {
  return (
    <div className="modal-dialog-header">
      <div className="modal-dialog-header-text">
        <Text.Heading id="modal-dialog-title" variant="03" as="h2" className="modal-dialog-title">
          {title}
        </Text.Heading>
        {description != null && (
          <Text.Label as="p" className="modal-dialog-description">
            {description}
          </Text.Label>
        )}
      </div>
      <Button
        data-modal-close
        variant="icon-button"
        size="sm"
        icon={<XIcon />}
        label="Закрыть"
        onClick={onClose}
      />
    </div>
  )
}

function PrivateBody({ children }: { children?: React.ReactNode }) {
  return (
    <div className="modal-dialog-body">
      <Layer level={1}>{children}</Layer>
    </div>
  )
}

function PrivateActions({ actions }: { actions?: DialogButtonConfig[] }) {
  if (!actions?.length) return null
  return (
    <div className="modal-dialog-actions">
      <ButtonGroup condensed direction="horizontal">
        {actions.map((action, i) => (
          <Button
            key={i}
            label={action.label}
            icon={action.icon}
            variant={action.variant ?? "primary"}
            onClick={action.onClick}
            disabled={action.disabled}
            size="xl"
          />
        ))}
      </ButtonGroup>
    </div>
  )
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

function Dialog({
  description,
  title,
  size = "md",
  onClose,
  closeOnEscape = true,
  actions,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    el.showModal()
    el.querySelector<HTMLElement>("[data-modal-close]")?.focus({ preventScroll: true })

    // Браузер шлёт `cancel` и при Escape, и при отмене вложенного file picker — не закрываем по нему.
    const handleCancel = (e: Event) => {
      e.preventDefault()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!closeOnEscape || e.key !== "Escape") return
      e.preventDefault()
      onCloseRef.current()
    }

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === el) {
        el.querySelector<HTMLElement>("[data-modal-close]")?.focus({ preventScroll: true })
      }
    }

    el.addEventListener("cancel", handleCancel)
    el.addEventListener("keydown", handleKeyDown)
    el.addEventListener("click", handleBackdropClick)

    return () => {
      el.removeEventListener("cancel", handleCancel)
      el.removeEventListener("keydown", handleKeyDown)
      el.removeEventListener("click", handleBackdropClick)
      if (el.open) el.close()
    }
  }, [closeOnEscape])

  return (
    <dialog
      ref={dialogRef}
      data-size={size}
      className="modal-dialog"
      aria-labelledby="modal-dialog-title"
    >
      <PrivateHeader description={description} title={title} onClose={onClose} />
      <PrivateBody>{children}</PrivateBody>
      <PrivateActions actions={actions} />
    </dialog>
  )
}

export { Dialog }
