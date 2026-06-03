import { Stack, Text } from "@miracle/aramid"
import type {
  DesignationSlot,
  Stored,
  TechnicalCondition,
  TechnicalConditionRule,
} from "@miracle/types"
import { ArrayEditor } from "@/components/ui/array-editor"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

  const update = (i: number, patch: Partial<TechnicalConditionRule>) =>
    rules.onChange(rules.value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

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
        onAdd={() => rules.onChange([...rules.value, makeRule()])}
        onRemove={(i) => rules.onChange(rules.value.filter((_, idx) => idx !== i))}
        renderItem={(rule, i) => (
          <Stack gap={1}>
            <Text.Helper as="span">{formatRuleUsageLine(rule.id, slots.value)}</Text.Helper>
            <Input
              label="Заголовок"
              placeholder="Напр. 5.3 Климатическое исполнение"
              value={rule.title ?? ""}
              onChange={(e) => update(i, { title: e.target.value })}
              disabled={isSaving}
              fluid
            />
            <div className="flex flex-col gap-0.5">
              <Textarea
                label="Текст правила"
                size="md"
                placeholder="Таблицы хранятся как markdown-таблицы"
                value={rule.content}
                onChange={(e) => update(i, { content: e.target.value })}
                disabled={isSaving}
                resizable={true}
                fluid
              />
            </div>
          </Stack>
        )}
        addLabel="Добавить правило"
        disabled={isSaving}
      />
    </>
  )
}
