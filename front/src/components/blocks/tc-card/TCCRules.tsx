import { Stack, Text } from "@miracle/aramid"
import type {
  DesignationSlot,
  Stored,
  TechnicalCondition,
  TechnicalConditionRule,
} from "@miracle/types"
import { useEffect, useState } from "react"
import { ArrayEditor, moveArrayItem, type ArrayEditorKey } from "@/components/ui/derivations"
import { Input } from "@/components/ui/ds/input"
import { Textarea } from "@/components/ui/ds/textarea"
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { createUuid } from "@/lib/uuid"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

function makeRule(): TechnicalConditionRule {
  return { id: createUuid(), title: "", content: "" }
}

/** Позиции параметров (1-based), как в подписи слота «N Название параметра». */
function formatRuleUsageLine(ruleId: string, slots: DesignationSlot[]): string {
  const positions: number[] = []
  slots.forEach((slot, i) => {
    if (slot.ruleIds.includes(ruleId)) {
      positions.push(i + 1)
    }
  })
  if (positions.length === 0) {
    return "Не используется"
  }
  return `Используется: ${positions.map((p) => `#${p}`).join(", ")}`
}

export function TCCRules() {
  const { technicalCondition, contribute, isSaving, rules } = useTechnicalConditionCardContext()
  const tc = technicalCondition
  const slots = useField<DesignationSlot[]>(`tc-${tc.id}-slots`, tc.designationSlots ?? [])
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(rules.value[0]?.id ?? null)

  useEffect(() => {
    if (!rules.value.length) {
      if (selectedRuleId !== null) setSelectedRuleId(null)
      return
    }
    if (selectedRuleId === null) return
    if (rules.value.some((rule) => rule.id === selectedRuleId)) return
    setSelectedRuleId(rules.value[0]?.id ?? null)
  }, [rules.value, selectedRuleId])

  const selectedRuleIndex = selectedRuleId
    ? rules.value.findIndex((rule) => rule.id === selectedRuleId)
    : -1
  const selectedRule = selectedRuleIndex >= 0 ? rules.value[selectedRuleIndex] : null

  const update = (ruleId: string, patch: Partial<TechnicalConditionRule>) =>
    rules.onChange(rules.value.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)))

  const handleAdd = () => {
    const nextRule = makeRule()
    rules.onChange([...rules.value, nextRule])
    setSelectedRuleId(nextRule.id)
  }

  const handleRemove = (key: ArrayEditorKey, index: number) => {
    const next = rules.value.filter((rule) => rule.id !== key)
    rules.onChange(next)
    if (selectedRuleId === key) {
      setSelectedRuleId(next[Math.min(index, next.length - 1)]?.id ?? null)
    }
  }

  useContribute(
    contribute,
    `tc-${tc.id}-rules`,
    (draft): Stored<TechnicalCondition> => ({
      ...draft,
      rules: rules.value,
    }),
  )

  return (
    <>
      <Text.Heading as="p" variant="02">
        Правила
      </Text.Heading>
      <ArrayEditor
        items={rules.value}
        getKey={(rule) => rule.id}
        selected={selectedRuleId}
        onSelected={(key) => setSelectedRuleId(typeof key === "string" ? key : null)}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onMove={(fromIndex, toIndex) => rules.onChange(moveArrayItem(rules.value, fromIndex, toIndex))}
        renderLabel={(rule, i) => (
          <Stack gap={1}>
            <Text as="span" compact>
              {(rule.title ?? "").trim() || `Правило ${i + 1}`}
            </Text>
            <Text.Helper as="span">{formatRuleUsageLine(rule.id, slots.value)}</Text.Helper>
          </Stack>
        )}
        addLabel="Добавить правило"
        helperText="Выберите правило, чтобы отредактировать название и текст."
        disabled={isSaving}
        fluid
      />
      {selectedRule && (
        <Stack gap={1}>
          <Input
            label="Заголовок"
            placeholder="Напр. 5.3 Климатическое исполнение"
            value={selectedRule.title ?? ""}
            onChange={(e) => update(selectedRule.id, { title: e.target.value })}
            disabled={isSaving}
            fluid
          />
          <Textarea
            label="Текст правила"
            size="md"
            placeholder="Таблицы хранятся как markdown-таблицы"
            value={selectedRule.content}
            onChange={(e) => update(selectedRule.id, { content: e.target.value })}
            disabled={isSaving}
            resizable={true}
            fluid
          />
        </Stack>
      )}
    </>
  )
}
