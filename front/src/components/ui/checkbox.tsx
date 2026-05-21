import * as React from "react"
import { Check, X, AlertCircle, AlertTriangle } from "lucide-react"
import { Text } from "@miracle/aramid"
import { cn } from "@/lib/utils"

import "@/design/checkbox.css"

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TriStateValue = boolean | undefined

interface BaseCheckboxProps {
  label?: string
  disabled?: boolean
  error?: string
  warn?: string
}

// ─── Shared message renderer ────────────────────────────────────────────────────

function CheckboxMessages({ error, warn }: { error?: string; warn?: string }) {
  if (error) {
    return (
      <p className="checkbox-message checkbox-message--error">
        <span aria-hidden="true"><AlertCircle /></span>
        {error}
      </p>
    )
  }
  if (warn) {
    return (
      <p className="checkbox-message checkbox-message--warn">
        <span aria-hidden="true"><AlertTriangle /></span>
        {warn}
      </p>
    )
  }
  return null
}

// ─── CheckboxItem ───────────────────────────────────────────────────────────────

type CheckboxItemProps =
  Omit<React.ComponentProps<"input">, "type" | "checked" | "onChange" | "size" | "disabled"> &
  BaseCheckboxProps & {
    checked?: boolean
    onChange?: (checked: boolean) => void
  }

function CheckboxItem({
  label,
  checked,
  onChange,
  disabled,
  error,
  warn,
  className,
  ...props
}: CheckboxItemProps) {
  const state = checked ? "checked" : "unchecked"
  const hasMessage = error || warn

  const item = (
    <label
      className={cn("checkbox-item", className)}
      data-state={state}
      data-disabled={disabled ? "true" : undefined}
      data-invalid={error ? "true" : undefined}
    >
      <input
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        {...props}
      />
      <span className="checkbox-box" aria-hidden="true">
        {checked && <span aria-hidden="true"><Check /></span>}
      </span>
      {label && <span className="checkbox-item-label">{label}</span>}
    </label>
  )

  if (hasMessage) {
    return (
      <div className="checkbox-field">
        {item}
        <CheckboxMessages error={error} warn={warn} />
      </div>
    )
  }

  return item
}

// ─── CheckboxTristateItem ────────────────────────────────────────────────────────

function getNextValue(value: TriStateValue): TriStateValue {
  if (value === undefined) return true
  if (value === true) return false
  return undefined
}

type CheckboxTristateItemProps = BaseCheckboxProps & {
  value: TriStateValue
  onChange: (next: TriStateValue) => void
  className?: string
}

function CheckboxTristateItem({
  label,
  value,
  onChange,
  disabled,
  error,
  warn,
  className,
}: CheckboxTristateItemProps) {
  const state = value === true ? "checked" : value === false ? "excluded" : "unchecked"
  const hasMessage = error || warn

  const item = (
    <label
      className={cn("checkbox-item", className)}
      data-state={state}
      data-disabled={disabled ? "true" : undefined}
      data-invalid={error ? "true" : undefined}
    >
      <input
        type="checkbox"
        className="checkbox-input"
        checked={value === true}
        disabled={disabled}
        onChange={() => {
          if (!disabled) onChange(getNextValue(value))
        }}
      />
      <span className="checkbox-box" aria-hidden="true">
        {value === true && <span aria-hidden="true"><Check /></span>}
        {value === false && <span aria-hidden="true"><X /></span>}
      </span>
      {label && <span className="checkbox-item-label">{label}</span>}
    </label>
  )

  if (hasMessage) {
    return (
      <div className="checkbox-field">
        {item}
        <CheckboxMessages error={error} warn={warn} />
      </div>
    )
  }

  return item
}

// ─── CheckboxGroup ───────────────────────────────────────────────────────────────

type CheckboxGroupProps = {
  label: string
  direction?: "vertical" | "horizontal"
  error?: string
  warn?: string
  className?: string
  children: React.ReactNode
}

function CheckboxGroup({
  label,
  direction = "vertical",
  error,
  warn,
  className,
  children,
}: CheckboxGroupProps) {
  return (
    <fieldset className={cn("checkbox-group", className)}>
      <Text.Helper as="legend">{label}</Text.Helper>
      <div className={cn(
        "checkbox-group-items",
        direction === "horizontal" && "checkbox-group-items--horizontal",
      )}>
        {children}
      </div>
      <CheckboxMessages error={error} warn={warn} />
    </fieldset>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────────

const Checkbox = {
  Item: CheckboxItem,
  TristateItem: CheckboxTristateItem,
  Group: CheckboxGroup,
}

export { Checkbox }
