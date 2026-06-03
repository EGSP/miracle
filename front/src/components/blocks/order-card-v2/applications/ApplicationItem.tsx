import type { ApplicationData, OrderApplication, Stored } from "@miracle/types"
import { File, MessageSquareText } from "lucide-react"
import type * as React from "react"

import { useGetFiles } from "@/lib/queries/file.query"
import { cn } from "@/lib/utils"

import { useViewApplication } from "./ViewApplicationDialog"
import "./application-item.css"

export type ApplicationItemProps = {
  application: Stored<OrderApplication>
  compact?: boolean
  fluid?: boolean
  disabled?: boolean
  /** По умолчанию открывает диалог просмотра (`useViewApplication`). */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  className?: string
}

type ApplicationItemShellProps = Pick<
  ApplicationItemProps,
  "compact" | "fluid" | "disabled" | "onClick" | "className"
>

type ItemShellProps = ApplicationItemShellProps & {
  children: React.ReactNode
}

function ApplicationItemShell({
  compact = false,
  fluid = false,
  disabled,
  onClick,
  className,
  children,
}: ItemShellProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "application-item",
        compact && "application-item--compact",
        fluid && "application-item--fluid",
        className,
      )}
    >
      {children}
    </button>
  )
}

function ApplicationItemText({
  text,
  ...shell
}: ApplicationItemShellProps & { text: string }) {
  return (
    <ApplicationItemShell {...shell}>
      <span className="application-item__icon" aria-hidden="true">
        <MessageSquareText size={16} />
      </span>
      <span className="application-item__label">{text}</span>
    </ApplicationItemShell>
  )
}

function ApplicationItemFile({
  fileId,
  ...shell
}: ApplicationItemShellProps & { fileId: string }) {
  const { data: files = [], isPending } = useGetFiles({ id: fileId })
  const label = files[0]?.name ?? (isPending ? "Загрузка…" : "Файл")

  return (
    <ApplicationItemShell {...shell}>
      <span className="application-item__icon" aria-hidden="true">
        <File size={16} />
      </span>
      <span className="application-item__label">{label}</span>
    </ApplicationItemShell>
  )
}

export function ApplicationItem({
  application,
  onClick,
  ...shell
}: ApplicationItemProps) {
  const { viewApplication } = useViewApplication()
  const data = application.data as ApplicationData

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (onClick) {
      onClick(event)
      return
    }
    viewApplication(application)
  }

  if (data.type === "text") {
    return <ApplicationItemText text={data.text} {...shell} onClick={handleClick} />
  }

  return <ApplicationItemFile fileId={data.fileId} {...shell} onClick={handleClick} />
}
