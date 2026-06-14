// Чистая логика отображения обозначения переехала в `@miracle/types` (общая с бэкенд-отчётом).
// Здесь — ре-экспорт для существующих импортов `@/lib/designation-display` + UI-специфика (CSS-классы).
export {
  buildDesignationDisplayCopyText,
  buildDesignationDisplayParts,
  buildDesignationInspectorRows,
  type DesignationDisplayPart,
  type DesignationDisplayTone,
  type DesignationInspectorRow,
  designationDisplayText,
  designationDisplayTone,
  isDesignationInspectorIssue,
  isSetDesignationValue,
  isUnsetDesignationValue,
  renderDesignationTemplate,
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
