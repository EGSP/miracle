import { IconIndicator, type IconIndicatorKind, Text } from "@miracle/aramid"
import type * as React from "react"
import { useId } from "react"

import { cn } from "@/lib/utils"

import "@/design/progress-bar.css"

export type ProgressBarStatus = "running" | "partial" | "succeed" | "failed"

export interface ProgressBarProps extends Omit<React.ComponentProps<"div">, "children"> {
  label: string
  helperText?: string
  status: ProgressBarStatus
  /**
   * Значение от 0 до 1. null / undefined считаются нулевым заполнением.
   */
  fill?: number | null
  /**
   * true — известный прогресс, false — неизвестный остаток анимируется.
   */
  determinate?: boolean
  /**
   * true — компактный трек 4px, false — обычный трек 8px.
   */
  compact?: boolean
}

const indicatorByStatus: Record<ProgressBarStatus, IconIndicatorKind> = {
  running: "in-progress",
  partial: "caution-minor",
  succeed: "succeeded",
  failed: "failed",
}

const statusTextByStatus: Record<ProgressBarStatus, string> = {
  running: "Выполняется",
  partial: "Выполнено частично",
  succeed: "Выполнено",
  failed: "Ошибка",
}

function normalizeFill(fill: number | null | undefined): number {
  if (fill == null || !Number.isFinite(fill)) return 0
  return Math.min(1, Math.max(0, fill))
}

function ProgressBar({
  label,
  helperText,
  status,
  fill,
  determinate = false,
  compact = false,
  className,
  style,
  id,
  ...props
}: ProgressBarProps) {
  const generatedId = useId()
  const normalizedFill = normalizeFill(fill)
  const valueNow = Math.round(normalizedFill * 100)
  const helperId = helperText ? `${id ?? generatedId}-helper` : undefined
  const shouldAnimateRemainder = !determinate && status === "running" && normalizedFill < 1
  const ariaValueText = determinate
    ? `${statusTextByStatus[status]}, ${valueNow}%`
    : normalizedFill > 0
      ? `${statusTextByStatus[status]}, известно ${valueNow}%`
      : statusTextByStatus[status]

  const rootStyle = {
    ...style,
    "--progress-bar-fill": normalizedFill,
  } as React.CSSProperties

  return (
    <div
      id={id}
      data-slot="progress-bar"
      data-status={status}
      data-compact={compact ? "true" : undefined}
      className={cn("progress-bar", className)}
      style={rootStyle}
      {...props}
    >
      <Text.Helper as="span" className="progress-bar-label">
        {label}
      </Text.Helper>

      <div className="progress-bar-track-row">
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-label={label}
          aria-describedby={helperId}
          aria-valuemin={determinate ? 0 : undefined}
          aria-valuemax={determinate ? 100 : undefined}
          aria-valuenow={determinate ? valueNow : undefined}
          aria-valuetext={ariaValueText}
        >
          <div className="progress-bar-fill" />
          {shouldAnimateRemainder && (
            <div className="progress-bar-remainder" aria-hidden="true">
              <span className="progress-bar-remainder-indicator" />
            </div>
          )}
        </div>

        <IconIndicator
          kind={indicatorByStatus[status]}
          size={16}
          className="progress-bar-status-icon"
        />
      </div>

      {helperText && (
        <Text.Helper id={helperId} as="span" className="progress-bar-helper-text">
          {helperText}
        </Text.Helper>
      )}
    </div>
  )
}

export { ProgressBar }
