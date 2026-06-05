import { Stack, Text, Grid, Column } from "@miracle/aramid"
import type { SlotRule, Stored, TechnicalCondition } from "@miracle/types"
import { useEffect, useState } from "react"
import { ArrayEditor, moveArrayItem, type ArrayEditorKey } from "@/components/ui/derivations"
import { Input } from "@/components/ui/ds/input"
import { Textarea } from "@/components/ui/ds/textarea"
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

function makeSlotRule(index: number): SlotRule {
  return { index, name: "", text: "" }
}

function keyToIndex(key: ArrayEditorKey | null): number | null {
  return typeof key === "number" ? key : null
}

function normalizeIndexes(rules: SlotRule[]): SlotRule[] {
  return rules.map((rule, index) => ({ ...rule, index }))
}

function getIndexAfterRemove(selected: number | null, removed: number, nextLength: number): number | null {
  if (selected === null) return null
  if (nextLength === 0) return null
  if (selected === removed) return Math.min(removed, nextLength - 1)
  if (selected > removed) return selected - 1
  return selected
}

function getIndexAfterMove(selected: number | null, from: number, to: number): number | null {
  if (selected === null || from === to) return selected
  if (selected === from) return to
  if (from < to && selected > from && selected <= to) return selected - 1
  if (to < from && selected >= to && selected < from) return selected + 1
  return selected
}

export function TCCSlotRules() {
  const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext()
  const tc = technicalCondition

  const slotRules = useField<SlotRule[]>(`tc-${tc.id}-slot-rules`, tc.slotRules ?? [])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(slotRules.value.length > 0 ? 0 : null)

  const selectedRule =
    selectedIndex !== null ? (slotRules.value[selectedIndex] ?? null) : null

  useEffect(() => {
    if (!slotRules.value.length) {
      if (selectedIndex !== null) setSelectedIndex(null)
      return
    }
    if (selectedIndex !== null && selectedIndex >= slotRules.value.length) {
      setSelectedIndex(slotRules.value.length - 1)
    }
  }, [slotRules.value.length, selectedIndex])

  const update = (i: number, patch: Partial<SlotRule>) =>
    slotRules.onChange(slotRules.value.map((rule, idx) => (idx === i ? { ...rule, ...patch } : rule)))

  const handleAdd = () => {
    const next = makeSlotRule(slotRules.value.length)
    slotRules.onChange([...slotRules.value, next])
    setSelectedIndex(slotRules.value.length)
  }

  const handleRemove = (_key: ArrayEditorKey, index: number) => {
    const next = normalizeIndexes(slotRules.value.filter((_, idx) => idx !== index))
    slotRules.onChange(next)
    setSelectedIndex((current) => getIndexAfterRemove(current, index, next.length))
  }

  const handleMove = (fromIndex: number, toIndex: number) => {
    slotRules.onChange(normalizeIndexes(moveArrayItem(slotRules.value, fromIndex, toIndex)))
    setSelectedIndex((current) => getIndexAfterMove(current, fromIndex, toIndex))
  }

  useContribute(
    contribute,
    `tc-${tc.id}-slot-rules`,
    (draft): Stored<TechnicalCondition> => ({
      ...draft,
      slotRules: slotRules.value.map((rule, i) => ({ ...rule, index: i })),
    }),
  )

  return (
    <Grid narrow fullWidth>
      <Column span="100%">
        <Text.Heading as="p" variant="02">
          Правила параметров обозначения
        </Text.Heading>
      </Column>
      <Column span="50%">
        <ArrayEditor
          items={slotRules.value}
          getKey={(_, i) => i}
          selected={selectedIndex}
          onSelected={(key) => setSelectedIndex(keyToIndex(key))}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onMove={handleMove}
          renderLabel={(rule, i) => (
            <Stack gap={1}>
              <Text as="span" compact>
                {`${i + 1}.`+(rule.name ?? "").trim() || `Параметр ${i + 1}`}
              </Text>
              <Text.Helper as="span">
                {rule.text.trim() ? "Текст правил задан" : "Текст правил не задан"}
              </Text.Helper>
            </Stack>
          )}
          addLabel="Добавить параметр"
          helperText="Выберите параметр, чтобы изменить название и текст правил из ТУ."
          disabled={isSaving}
          fluid
        />
      </Column>
      <Column span="50%">
        {selectedRule && selectedIndex !== null && (
          <Stack gap={1}>
            <Input
              label={`${selectedIndex + 1} Название параметра`}
              placeholder="Напр. Климатическое исполнение"
              value={selectedRule.name}
              onChange={(e) => update(selectedIndex, { name: e.target.value })}
              disabled={isSaving}
              fluid
            />
            <Textarea
              label="Текст правил из ТУ"
              placeholder="Таблицы и пункты ТУ для выбора значения параметра"
              value={selectedRule.text}
              onChange={(e) => update(selectedIndex, { text: e.target.value })}
              disabled={isSaving}
              rows={12}
              fluid
              size="lg"
            />
          </Stack>
        )}
      </Column>
    </Grid>
  )
}
