import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "icon-button"
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl"

export interface BaseButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fluid?: boolean
  /** Текст кнопки. При variant="icon-button" используется как aria-label. */
  label?: string
  /** Иконка. По Carbon всегда справа от лейбла (trailing). */
  icon?: ReactNode
}

export const buttonVariants = cva("button", {
  variants: {
    variant: {
      primary:       "button--primary",
      secondary:     "button--secondary",
      tertiary:      "button--tertiary",
      ghost:         "button--ghost",
      danger:        "button--danger",
      "icon-button": "button--icon-button",
    },
    size: {
      xs: "button--xs",
      sm: "button--sm",
      md: "button--md",
      lg: "button--lg",
      xl: "button--xl",
    },
    fluid: {
      true:  "button--fluid",
      false: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    size:    "md",
    fluid:   false,
  },
})

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
