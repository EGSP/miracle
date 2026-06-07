import { IconIndicator, type IconIndicatorKind, Text } from "@miracle/aramid"
import type * as React from "react"
import { useId } from "react"

import { cn } from "@/lib/utils"

import "@/design/progress-bar.css"

export type ProgressBarStatus = "running" | "partial" | "succeed" | "failed"

interface BaseProgressBarProps {
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

export interface ProgressBarProps
  extends Omit<React.ComponentProps<"div">, "children">,
    BaseProgressBarProps {
  label: string
  helperText?: string
}

export interface InlineProgressBarProps
  extends Omit<React.ComponentProps<"div">, "children">,
    BaseProgressBarProps {
  label?: string
  /**
   * Доступное имя progressbar, если видимый label не нужен.
   */
  ariaLabel?: string
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

function getProgressBarState(
  status: ProgressBarStatus,
  fill: number | null | undefined,
  determinate: boolean,
) {
  const normalizedFill = normalizeFill(fill)
  const valueNow = Math.round(normalizedFill * 100)
  const shouldAnimateRemainder = !determinate && status === "running" && normalizedFill < 1
  const ariaValueText = determinate
    ? `${statusTextByStatus[status]}, ${valueNow}%`
    : normalizedFill > 0
      ? `${statusTextByStatus[status]}, известно ${valueNow}%`
      : statusTextByStatus[status]

  return {
    ariaValueText,
    normalizedFill,
    shouldAnimateRemainder,
    valueNow,
  }
}

function getProgressBarStyle(
  style: React.CSSProperties | undefined,
  normalizedFill: number,
): React.CSSProperties {
  return {
    ...style,
    "--progress-bar-fill": normalizedFill,
  } as React.CSSProperties
}

interface ProgressBarTrackProps {
  ariaDescribedBy?: string
  ariaLabel: string
  ariaValueText: string
  determinate: boolean
  shouldAnimateRemainder: boolean
  status: ProgressBarStatus
  valueNow: number
}

function ProgressBarTrack({
  ariaDescribedBy,
  ariaLabel,
  ariaValueText,
  determinate,
  shouldAnimateRemainder,
  status,
  valueNow,
}: ProgressBarTrackProps) {
  return (
    <div className="progress-bar-track-row">
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
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
  )
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
  const progressState = getProgressBarState(status, fill, determinate)
  const helperId = helperText ? `${id ?? generatedId}-helper` : undefined
  const rootStyle = getProgressBarStyle(style, progressState.normalizedFill)

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

      <ProgressBarTrack
        ariaDescribedBy={helperId}
        ariaLabel={label}
        determinate={determinate}
        status={status}
        {...progressState}
      />

      {helperText && (
        <Text.Helper id={helperId} as="span" className="progress-bar-helper-text">
          {helperText}
        </Text.Helper>
      )}
    </div>
  )
}

function InlineProgressBar({
  label,
  ariaLabel,
  status,
  fill,
  determinate = false,
  compact = false,
  className,
  style,
  ...props
}: InlineProgressBarProps) {
  const progressState = getProgressBarState(status, fill, determinate)
  const rootStyle = getProgressBarStyle(style, progressState.normalizedFill)
  const accessibleLabel = ariaLabel ?? props["aria-label"] ?? label ?? "Прогресс"

  return (
    <div
      data-slot="inline-progress-bar"
      data-status={status}
      data-compact={compact ? "true" : undefined}
      className={cn("inline-progress-bar", className)}
      style={rootStyle}
      {...props}
    >
      {label && (
        <Text.Helper as="span" className="inline-progress-bar-label">
          {label}
        </Text.Helper>
      )}

      <ProgressBarTrack
        ariaLabel={accessibleLabel}
        determinate={determinate}
        status={status}
        {...progressState}
      />
    </div>
  )
}

export { InlineProgressBar, ProgressBar }
