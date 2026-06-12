import type { ApplicationData, OrderApplication, PrepareStatus, Stored } from "@miracle/types"
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  FileIcon,
  LoaderCircle,
  type LucideIcon,
  MessageSquareText,
} from "lucide-react"
import type * as React from "react"

import { usePreparedStatus } from "@/lib/queries/document-prepare.query"
import { useGetFiles } from "@/lib/queries/file.query"
import { cn } from "@/lib/utils"

import { useViewApplication } from "./ViewApplicationDialog"
import "./application-item.css"

/** Состояние индикатора подготовки: статусы DPS + локальные «загрузка» и «нет записи». */
type PrepareIconState = "loading" | "none" | "queued" | "running" | "succeed" | "failed"

const PREPARE_ICON: Record<
  PrepareIconState,
  { Icon: LucideIcon; modifier: string; title: string; spin?: boolean }
> = {
  loading: {
    Icon: LoaderCircle,
    modifier: "application-item__status--muted",
    title: "Проверка статуса подготовки…",
    spin: true,
  },
  none: {
    Icon: CircleHelp,
    modifier: "application-item__status--muted",
    title: "Документ не подготавливался",
  },
  queued: {
    Icon: Clock,
    modifier: "application-item__status--queued",
    title: "В очереди на подготовку",
  },
  running: {
    Icon: LoaderCircle,
    modifier: "application-item__status--running",
    title: "Идёт подготовка документа",
    spin: true,
  },
  succeed: {
    Icon: CircleCheck,
    modifier: "application-item__status--succeed",
    title: "Документ подготовлен",
  },
  failed: {
    Icon: CircleAlert,
    modifier: "application-item__status--failed",
    title: "Ошибка подготовки документа",
  },
}

/**
 * Индикатор статуса подготовки документа. Статус приходит снаружи — один поллинг на `ApplicationItemFile`.
 */
function PrepareStatusIcon({
  status,
  isPending,
  isError,
}: {
  status: PrepareStatus | null | undefined
  isPending: boolean
  isError: boolean
}) {
  const state: PrepareIconState = isPending
    ? "loading"
    : isError
      ? "none"
      : (status ?? "none")

  const { Icon, modifier, title, spin } = PREPARE_ICON[state]

  return (
    <span
      className={cn("application-item__icon", "application-item__status", modifier)}
      role="img"
      aria-label={title}
      title={title}
    >
      <Icon size={16} className={spin ? "application-item__spin" : undefined} />
    </span>
  )
}

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
  ...rest
}: ItemShellProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
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
      {...rest}
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
  className,
  ...shell
}: ApplicationItemShellProps & { fileId: string }) {
  const { data: files = [], isPending: isFilesPending } = useGetFiles({ id: fileId })
  const {
    data: prepareStatus,
    isPending: isPrepareStatusPending,
    isError: isPrepareStatusError,
  } = usePreparedStatus(fileId)
  const status = prepareStatus?.status
  const prepareFailed = !isPrepareStatusPending && !isPrepareStatusError && status === "failed"
  const label = files[0]?.name ?? (isFilesPending ? "Загрузка…" : "Файл")

  return (
    <ApplicationItemShell
      {...shell}
      className={cn(className, prepareFailed && "application-item--prepare-failed")}
      aria-invalid={prepareFailed || undefined}
    >
      <span className="application-item__icon" aria-hidden="true">
        <FileIcon size={16} />
      </span>
      <span className="application-item__label">{label}</span>
      <PrepareStatusIcon
        status={status}
        isPending={isPrepareStatusPending}
        isError={isPrepareStatusError}
      />
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
