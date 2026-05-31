import { Stack, Text } from "@miracle/aramid"
import type { Designation } from "@miracle/types"
import { Fragment, useMemo } from "react"
import { CopyButton } from "@/components/ui/derivations"
import {
  buildDesignationDisplayCopyText,
  buildDesignationDisplayParts,
  renderDesignationTemplate,
} from "@/lib/designation-display"
import { useTechnicalCondition } from "@/lib/queries/technical-condition.query"
import { useFieldLayerStyle } from "@/lib/use-field-layer-style"
import "@/design/designation-display.css"

export type DesignationDisplayProps = {
  designation: Designation
}

/**
 * Компактное условное обозначение: значения слотов по `slotIndex`,
 * пропуски и `null` — «?», между частями разделитель «-».
 * Подсветка: warn — пусто или confidence < 0.7; critical — значение есть и confidence < 0.5.
 */
export function DesignationDisplay({ designation }: DesignationDisplayProps) {
  const fieldStyle = useFieldLayerStyle()
  const tcQuery = useTechnicalCondition(designation.tcId)

  const parts = useMemo(() => buildDesignationDisplayParts(designation), [designation])

  const templateText = useMemo(() => {
    const tc = tcQuery.data
    const template = tc?.displayTemplates?.[0]?.format
    if (!tc || !template) {
      return null
    }
    return renderDesignationTemplate(designation, tc, template)
  }, [designation, tcQuery.data])

  const copyText = useMemo(() => {
    return templateText ?? buildDesignationDisplayCopyText(designation)
  }, [designation, templateText])

  const ariaLabel = copyText || undefined

  if (parts.length === 0) {
    return null
  }

  return (
    <Fragment>
      {templateText ? (
        <Text.Helper as="p">
          По шаблону: <Text.Code as="span">{templateText}</Text.Code>
        </Text.Helper>
      ) : null}
      <Stack gap={2} orientation="horizontal">
        <div
          className="designation-display"
          role="group"
          aria-label={ariaLabel ? `Условное обозначение: ${ariaLabel}` : undefined}
          style={fieldStyle}
        >
          {parts.map((part, index) => (
            <Fragment key={part.slotIndex}>
              {index > 0 ? (
                <span className="designation-display-separator">
                  <Text.Code as="span">-</Text.Code>
                </span>
              ) : null}
              <span
                className={
                  part.tone === "none"
                    ? "designation-display-part"
                    : `designation-display-part designation-display-part--${part.tone}`
                }
              >
                <Text.Code as="span" expressive>
                  {part.text}
                </Text.Code>
              </span>
            </Fragment>
          ))}
        </div>
        <CopyButton text={copyText} size="md" label="Копировать условное обозначение" />
      </Stack>
    </Fragment>
  )
}
