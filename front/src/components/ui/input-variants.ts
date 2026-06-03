import { cva, type VariantProps } from "class-variance-authority"

export type InputSize = "sm" | "md" | "lg"

export interface BaseInputProps {
  size?: InputSize
  fluid?: boolean
  disabled?: boolean
  label?: string
  helperText?: string
}

export const inputVariants = cva("input", {
  variants: {
    size: {
      sm: "input--sm",
      md: "",
      lg: "input--lg",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export type InputVariantProps = VariantProps<typeof inputVariants>
