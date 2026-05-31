import { useLayerTokens } from "@miracle/aramid"
import type { CSSProperties } from "react"

/**
 * Inline-стили поля по текущему уровню Layer (фон и нижняя граница).
 */
export function useFieldLayerStyle(options?: {
  disabled?: boolean
  style?: CSSProperties
}): CSSProperties {
  const { fieldBackground, borderStrong } = useLayerTokens()
  const { disabled, style } = options ?? {}

  return {
    backgroundColor: fieldBackground,
    borderBottomColor: disabled ? "var(--aramid-color-gray-30)" : borderStrong,
    ...style,
  }
}
