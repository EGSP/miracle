// Чистая логика отображения обозначения переехала в `@miracle/types` (общая с бэкенд-отчётом).
// Здесь — ре-экспорт для существующих импортов `@/lib/designation-display` + UI-специфика (CSS-классы).
export {
  type DesignationDisplayTone,
  type DesignationDisplayPart,
  type DesignationInspectorRow,
  DESIGNATION_CONFIDENCE_WARN,
  DESIGNATION_CONFIDENCE_CRITICAL,
  isUnsetDesignationValue,
  isSetDesignationValue,
  designationDisplayText,
  designationDisplayTone,
  buildDesignationDisplayParts,
  buildDesignationDisplayCopyText,
  renderDesignationTemplate,
  isDesignationInspectorIssue,
  buildDesignationInspectorRows,
} from "@miracle/types"

import type { DesignationDisplayTone } from "@miracle/types"

export function designationToneClassName(tone: DesignationDisplayTone): string {
  if (tone === "warn") {
    return "designation-display-part designation-display-part--warn"
  }
  if (tone === "critical") {
    return "designation-display-part designation-display-part--critical"
  }
  return "designation-display-part"
}
