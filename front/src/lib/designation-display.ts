import type { Designation, DesignationValue, TechnicalCondition } from "@miracle/types"

/** Подсветка ячейки по уверенности LLM. */
export type DesignationDisplayTone = "none" | "warn" | "critical"

export type DesignationDisplayPart = {
  slotIndex: number
  text: string
  tone: DesignationDisplayTone
}

/** Пороги подсветки (согласованы с DesignationValue.confidence в типах). */
export const DESIGNATION_CONFIDENCE_WARN = 0.7
export const DESIGNATION_CONFIDENCE_CRITICAL = 0.5

/** `null`, пустая строка и литерал `"null"` (иногда приходит от LLM) — «не задано». */
export function isUnsetDesignationValue(value: string | null | undefined): boolean {
  return !isSetDesignationValue(value)
}

export function isSetDesignationValue(value: string | null | undefined): value is string {
  if (value === null || value === undefined) {
    return false
  }
  const trimmed = value.trim()
  return trimmed !== "" && trimmed.toLowerCase() !== "null"
}

/** Текст ячейки: незаданные значения → «?». */
export function designationDisplayText(value: string | null): string {
  return isSetDesignationValue(value) ? value : "?"
}

export function designationDisplayTone(
  value: DesignationValue | undefined,
): DesignationDisplayTone {
  if (!value || isUnsetDesignationValue(value.value)) {
    return "warn"
  }
  if (value.confidence < DESIGNATION_CONFIDENCE_CRITICAL) {
    return "critical"
  }
  if (value.confidence < DESIGNATION_CONFIDENCE_WARN) {
    return "warn"
  }
  return "none"
}

/**
 * Строит части условного обозначения по `designation.values`:
 * от min(slotIndex) до max(slotIndex), пропуски — «?»;
 * value null / `"null"` / пусто — «?».
 */
export function buildDesignationDisplayParts(designation: Designation): DesignationDisplayPart[] {
  const { values } = designation
  if (values.length === 0) {
    return []
  }

  const bySlot = new Map<number, DesignationValue>()
  for (const entry of values) {
    bySlot.set(entry.slotIndex, entry)
  }

  let min = values[0].slotIndex
  let max = values[0].slotIndex
  for (const entry of values) {
    if (entry.slotIndex < min) min = entry.slotIndex
    if (entry.slotIndex > max) max = entry.slotIndex
  }

  const parts: DesignationDisplayPart[] = []
  for (let slotIndex = min; slotIndex <= max; slotIndex++) {
    const entry = bySlot.get(slotIndex)
    if (entry) {
      parts.push({
        slotIndex,
        text: designationDisplayText(entry.value),
        tone: designationDisplayTone(entry),
      })
    } else {
      parts.push({
        slotIndex,
        text: "?",
        tone: "warn",
      })
    }
  }
  return parts
}

/** Плоский текст условного обозначения для буфера: части через «-», пропуски и незаданные — «?». */
export function buildDesignationDisplayCopyText(designation: Designation): string {
  return buildDesignationDisplayParts(designation)
    .map((part) => part.text)
    .join("-")
}

/**
 * Рендерит строку по шаблону вида "[1] [2]-[3]-...-[10]" (1-based).
 * Незаполненные/пустые значения, пропуски и выход за диапазон — «?».
 */
export function renderDesignationTemplate(
  designation: Designation,
  tc: TechnicalCondition,
  template: string | null | undefined,
): string {
  const format = template?.trim()
  if (!format) {
    return buildDesignationDisplayCopyText(designation)
  }

  const valueBySlot = new Map<number, string | null>()
  for (const entry of designation.values) {
    valueBySlot.set(entry.slotIndex, entry.value)
  }

  const maxSlotIndex = (tc.designationSlots ?? []).reduce(
    (max, slot) => (slot.index > max ? slot.index : max),
    -1,
  )

  return format.replace(/\[(\d+)]/g, (_, oneBasedRaw: string) => {
    const oneBasedIndex = Number(oneBasedRaw)
    if (!Number.isInteger(oneBasedIndex) || oneBasedIndex <= 0) {
      return "?"
    }

    const slotIndex = oneBasedIndex - 1
    if (maxSlotIndex >= 0 && slotIndex > maxSlotIndex) {
      return "?"
    }

    const rawValue = valueBySlot.get(slotIndex)
    return designationDisplayText(rawValue ?? null)
  })
}

export function designationToneClassName(tone: DesignationDisplayTone): string {
  if (tone === "warn") {
    return "designation-display-part designation-display-part--warn"
  }
  if (tone === "critical") {
    return "designation-display-part designation-display-part--critical"
  }
  return "designation-display-part"
}

/** Слот попадает в инспектор: пропуск в диапазоне, пустое значение или confidence < 0.5 при заданном value. */
export function isDesignationInspectorIssue(entry: DesignationValue | undefined): boolean {
  if (!entry) {
    return true
  }
  if (isUnsetDesignationValue(entry.value)) {
    return true
  }
  return entry.confidence < DESIGNATION_CONFIDENCE_CRITICAL
}

export type DesignationInspectorRow = {
  slotIndex: number
  slotName: string | null
  tone: DesignationDisplayTone
  confidence: number | null
  reasoning: string | null
}

/**
 * Строки инспектора: слоты min…max с проблемами (пропуск, пусто, critical).
 * `slotNames` — DesignationSlot.name по index из TC.
 */
export function buildDesignationInspectorRows(
  designation: Designation,
  slotNames: ReadonlyMap<number, string>,
): DesignationInspectorRow[] {
  const { values } = designation
  if (values.length === 0) {
    return []
  }

  const bySlot = new Map<number, DesignationValue>()
  for (const entry of values) {
    bySlot.set(entry.slotIndex, entry)
  }

  let min = values[0].slotIndex
  let max = values[0].slotIndex
  for (const entry of values) {
    if (entry.slotIndex < min) min = entry.slotIndex
    if (entry.slotIndex > max) max = entry.slotIndex
  }

  const rows: DesignationInspectorRow[] = []
  for (let slotIndex = min; slotIndex <= max; slotIndex++) {
    const entry = bySlot.get(slotIndex)
    if (!isDesignationInspectorIssue(entry)) {
      continue
    }

    rows.push({
      slotIndex,
      slotName: slotNames.get(slotIndex) ?? null,
      tone: designationDisplayTone(entry),
      confidence: entry?.confidence ?? null,
      reasoning: entry?.reasoning ?? "Параметр отсутствует в заявке",
    })
  }
  return rows
}
