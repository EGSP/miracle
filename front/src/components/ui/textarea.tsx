import { Text } from "@miracle/aramid"
import * as React from "react"

import type { BaseInputProps } from "@/components/ui/input-variants"
import { useFieldLayerStyle } from "@/lib/use-field-layer-style"
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
  (
    {
      className,
      size = "sm",
      fluid = false,
      resizable = true,
      disabled,
      label,
      helperText,
      style,
      ...props
    },
    ref,
  ) => {
    const fieldStyle = useFieldLayerStyle({ disabled })

    return (
      <div
        className={cn("textarea-field", fluid && "textarea-field--fluid", className)}
        style={style}
      >
        {label && <Text.Helper as="span">{label}</Text.Helper>}
        <textarea
          ref={ref}
          data-slot="textarea"
          disabled={disabled}
          className={cn("textarea", sizeClass[size], !resizable && "textarea--no-resize")}
          style={fieldStyle}
          {...props}
        />
        {helperText && (
          <Text.Helper as="span" className="field-helper-text">
            {helperText}
          </Text.Helper>
        )}
      </div>
    )
  },
)

Textarea.displayName = "Textarea"

export type { TextareaProps, TextareaSize }
export { Textarea }
