import * as React from "react"

import { buttonVariants, type BaseButtonProps } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

import "@/design/button.css"

type ButtonProps = React.ComponentProps<"button"> & BaseButtonProps

function Button({
  className,
  variant = "primary",
  size = "md",
  fluid = false,
  label,
  icon,
  children,
  ...props
}: ButtonProps) {
  const isIconButton = variant === "icon-button"

  return (
    <button
      data-slot="button"
      aria-label={isIconButton ? label : undefined}
      className={cn(
        buttonVariants({ variant, size, fluid: isIconButton ? false : fluid }),
        className,
      )}
      {...props}
    >
      {isIconButton ? (
        /* icon-button: только иконка, label живёт в aria-label на <button> */
        icon && <span className="button-icon" aria-hidden="true">{icon}</span>
      ) : (
        /* Обычная кнопка: label слева, иконка справа. children — legacy-путь. */
        label != null || icon != null ? (
          <>
            {label != null && <span className="button-label">{label}</span>}
            {icon != null && <span className="button-icon" aria-hidden="true">{icon}</span>}
          </>
        ) : (
          children
        )
      )}
    </button>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
