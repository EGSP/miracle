import * as React from "react"
import { Text } from "@miracle/aramid"

import { type BaseInputProps } from "@/components/ui/input-variants"
import { cn } from "@/lib/utils"

import "@/design/textarea.css"

type TextareaSize = "sm" | "md" | "lg" | "xl" | "auto"

type TextareaProps = Omit<React.ComponentProps<"textarea">, "size"> &
  Omit<BaseInputProps, "size"> & {
  size?: TextareaSize
  resizable?: boolean
}

const sizeClass: Record<TextareaSize, string> = {
  sm: "",
  md: "textarea--md",
  lg: "textarea--lg",
  xl: "textarea--xl",
  auto: "textarea--auto",
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size = "sm", full = false, resizable = true, disabled, label, ...props }, ref) => {
    const textarea = (
      <textarea
        ref={ref}
        data-slot="textarea"
        disabled={disabled}
        className={cn(
          "textarea",
          sizeClass[size],
          full && "textarea--full",
          !resizable && "textarea--no-resize",
          className
        )}
        {...props}
      />
    )

    if (label) {
      return (
        <div className="textarea-field">
          <Text.Helper as="span">{label}</Text.Helper>
          {textarea}
        </div>
      )
    }

    return textarea
  }
)

Textarea.displayName = "Textarea"

export { Textarea }
export type { TextareaProps, TextareaSize }
