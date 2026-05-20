import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { Text } from "@miracle/aramid"

import { InputDropdown } from "@/components/ui/input-dropdown"
import { InputSuggest } from "@/components/ui/input-suggest"
import { cn } from "@/lib/utils"

type InputRootProps = React.ComponentProps<"input"> & { label?: string }

function InputRoot({ className, type, label, ...props }: InputRootProps) {
  const input = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )

  if (label) {
    return (
      <div className="flex flex-col gap-0.5">
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
