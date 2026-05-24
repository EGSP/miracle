import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

import "@/design/button-group.css"

const buttonGroupVariants = cva("button-group", {
  variants: {
    direction: {
      horizontal: "",
      vertical:   "button-group--vertical",
    },
    condensed: {
      true:  "button-group--condensed",
      false: "",
    },
    wrap: {
      true:  "button-group--wrap",
      false: "",
    },
  },
  defaultVariants: {
    direction: "horizontal",
    condensed: false,
    wrap:      false,
  },
})

type ButtonGroupProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof buttonGroupVariants>

function ButtonGroup({
  direction,
  condensed,
  wrap,
  className,
  children,
  ...props
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(buttonGroupVariants({ direction, condensed, wrap }), className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { ButtonGroup, buttonGroupVariants }
export type { ButtonGroupProps }
