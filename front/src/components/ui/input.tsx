import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { Text } from "@miracle/aramid"

import { InputDropdown } from "@/components/ui/input-dropdown"
import { InputSuggest } from "@/components/ui/input-suggest"
import { inputVariants, type BaseInputProps } from "@/components/ui/input-variants"
import { useFieldLayerStyle } from "@/lib/use-field-layer-style"
import { cn } from "@/lib/utils"

import "@/design/input.css"

type InputRootProps = Omit<React.ComponentProps<"input">, "size"> & BaseInputProps

function InputRoot({ className, type, label, size, full, disabled, style, ...props }: InputRootProps) {
  const fieldStyle = useFieldLayerStyle({ disabled, style })

  const input = (
    <InputPrimitive
      type={type}
      disabled={disabled}
      data-slot="input"
      className={cn(inputVariants({ size, full }), className)}
      style={fieldStyle}
      {...props}
    />
  )

  if (label) {
    return (
      <div className="input-field">
        <Text.Helper as="span">{label}</Text.Helper>
        {input}
      </div>
    )
  }

  return input
}

const Input = Object.assign(InputRoot, {
  Dropdown: InputDropdown,
  Suggest: InputSuggest,
})

export { Input }
