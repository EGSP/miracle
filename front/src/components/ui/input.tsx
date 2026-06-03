import { Input as InputPrimitive } from "@base-ui/react/input"
import { Text } from "@miracle/aramid"
import type * as React from "react"

import { InputDropdown } from "@/components/ui/input-dropdown"
import { InputSuggest } from "@/components/ui/input-suggest"
import { type BaseInputProps, inputVariants } from "@/components/ui/input-variants"
import { useFieldLayerStyle } from "@/lib/use-field-layer-style"
import { cn } from "@/lib/utils"

import "@/design/input.css"

type InputRootProps = Omit<React.ComponentProps<"input">, "size"> & BaseInputProps

function InputRoot({
  className,
  type,
  label,
  helperText,
  size,
  fluid = false,
  disabled,
  style,
  ...props
}: InputRootProps) {
  const fieldStyle = useFieldLayerStyle({ disabled })

  return (
    <div
      className={cn("input-field", fluid && "input-field--fluid", className)}
      style={style}
    >
      {label && <Text.Helper as="span">{label}</Text.Helper>}
      <InputPrimitive
        type={type}
        disabled={disabled}
        data-slot="input"
        className={inputVariants({ size })}
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
}

const Input = Object.assign(InputRoot, {
  Dropdown: InputDropdown,
  Suggest: InputSuggest,
})

export { Input }
