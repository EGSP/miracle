import { Stack, Text } from "@miracle/aramid"
import type { Designation } from "@miracle/types"
import { useMemo } from "react"
import { buildDesignationInspectorRows, designationToneClassName } from "@/lib/designation-display"
import { useTechnicalCondition } from "@/lib/queries/technical-condition.query"
import "@/design/designation-display.css"
import "@/design/designation-inspector.css"

export type DesignationInspectorProps = {
  designation: Designation
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null) {
    return "0%"
  }
  return `${Math.round(confidence * 100)}%`
}

/**
 * Таблица слотов, требующих проверки: пропуск в диапазоне, пустое значение,
 * низкая уверенность при заданном value (confidence < 0.5).
 * Имена параметров — из TC по `designation.tcId`.
 * Колонка «Позиция» — 1-based (как в редакторе слотов ТУ), в данных остаётся `slotIndex` 0-based.
 */
export function DesignationInspector({ designation }: DesignationInspectorProps) {
  const tcQuery = useTechnicalCondition(designation.tcId)

  const slotNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const slot of tcQuery.data?.designationSlots ?? []) {
      map.set(slot.index, slot.name)
    }
    return map
  }, [tcQuery.data?.designationSlots])

  const rows = useMemo(
    () => buildDesignationInspectorRows(designation, slotNames),
    [designation, slotNames],
  )

  if (rows.length === 0) {
    return <Text.Helper as="p">Нет параметров, требующих проверки</Text.Helper>
  }

  return (
    <Stack gap={2}>
      <Text.Heading as="h4" variant="compact-01">
        Параметры, требующие проверки
      </Text.Heading>
      <table className="designation-inspector">
        <thead>
          <tr>
            <th scope="col">
              <Text.Label as="span">Позиция</Text.Label>
            </th>
            <th scope="col">
              <Text.Label as="span">Параметр</Text.Label>
            </th>
            <th scope="col">
              <Text.Label as="span">Уверенность и обоснование</Text.Label>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const position = row.slotIndex + 1
            return (
              <tr key={row.slotIndex}>
                <td className="designation-inspector-slot-position">
                  <span className={designationToneClassName(row.tone)}>
                    <Text.Code as="span">{`#${position}`}</Text.Code>
                  </span>
                </td>
                <td className="designation-inspector-slot-name">
                  <Text.Label as="span">{row.slotName ?? `Слот ${position}`}</Text.Label>
                </td>
                <td className="designation-inspector-detail">
                  <Stack gap={2}>
                    <Text.Helper as="span">{formatConfidence(row.confidence)}</Text.Helper>
                    <Text.Helper as="span">{row.reasoning}</Text.Helper>
                  </Stack>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Stack>
  )
}
