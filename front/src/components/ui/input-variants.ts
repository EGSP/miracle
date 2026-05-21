import { cva, type VariantProps } from "class-variance-authority"

export type InputSize = "sm" | "md" | "lg"

export interface BaseInputProps {
  size?: InputSize
  full?: boolean
  disabled?: boolean
  label?: string
}

export const inputVariants = cva("input", {
  variants: {
    size: {
      sm: "input--sm",
      md: "",
      lg: "input--lg",
    },
    full: {
      true: "input--full",
      false: "",
    },
  },
  defaultVariants: {
    size: "md",
    full: false,
  },
})

export type InputVariantProps = VariantProps<typeof inputVariants>
