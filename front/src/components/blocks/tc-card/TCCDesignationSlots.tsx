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
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

function makeSlot(index: number): DesignationSlot {
  return { index, name: "", ruleIds: [] }
}

function ruleLabel(rule: TechnicalConditionRule | null, orphanId?: string): string {
  if (rule) {
    const title = rule.title?.trim()
    return title || rule.id
  }
  if (orphanId) {
    return `Неизвестное правило (${orphanId})`
  }
  return "Правило не выбрано"
}

function keyToIndex(key: ArrayEditorKey | null): number | null {
  return typeof key === "number" ? key : null
}

function normalizeSlotIndexes(slots: DesignationSlot[]): DesignationSlot[] {
  return slots.map((slot, index) => ({ ...slot, index }))
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

export function TCCDesignationSlots() {
  const { technicalCondition, contribute, isSaving, rules } = useTechnicalConditionCardContext()
  const tc = technicalCondition

  const slots = useField<DesignationSlot[]>(`tc-${tc.id}-slots`, tc.designationSlots ?? [])
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(
    slots.value.length > 0 ? 0 : null,
  )
  const [selectedRuleRefIndex, setSelectedRuleRefIndex] = useState<number | null>(null)

  const selectedSlot =
    selectedSlotIndex !== null ? (slots.value[selectedSlotIndex] ?? null) : null
  const selectedRuleId =
    selectedSlot && selectedRuleRefIndex !== null
      ? selectedSlot.ruleIds[selectedRuleRefIndex]
      : undefined
  const selectedRule = selectedRuleId
    ? (rules.value.find((rule) => rule.id === selectedRuleId) ?? null)
    : null

  useEffect(() => {
    if (!slots.value.length) {
      if (selectedSlotIndex !== null) setSelectedSlotIndex(null)
      return
    }
    if (selectedSlotIndex !== null && selectedSlotIndex >= slots.value.length) {
      setSelectedSlotIndex(slots.value.length - 1)
    }
  }, [slots.value.length, selectedSlotIndex])

  useEffect(() => {
    const ruleIdsLength = selectedSlot?.ruleIds.length ?? 0
    if (!ruleIdsLength) {
      if (selectedRuleRefIndex !== null) setSelectedRuleRefIndex(null)
      return
    }
    if (selectedRuleRefIndex !== null && selectedRuleRefIndex >= ruleIdsLength) {
      setSelectedRuleRefIndex(ruleIdsLength - 1)
    }
  }, [selectedSlot?.ruleIds.length, selectedRuleRefIndex])

  const update = (i: number, patch: Partial<DesignationSlot>) =>
    slots.onChange(slots.value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const updateRuleId = (slotIdx: number, ruleIdx: number, value: string) => {
    const slot = slots.value[slotIdx]
    if (!slot) return
    const next = slot.ruleIds.map((id, i) => (i === ruleIdx ? value : id))
    update(slotIdx, { ruleIds: next })
  }

  const handleAddSlot = () => {
    const nextSlot = makeSlot(slots.value.length)
    slots.onChange([...slots.value, nextSlot])
    setSelectedSlotIndex(slots.value.length)
    setSelectedRuleRefIndex(null)
  }

  const handleRemoveSlot = (_key: ArrayEditorKey, index: number) => {
    const next = normalizeSlotIndexes(slots.value.filter((_, idx) => idx !== index))
    slots.onChange(next)
    setSelectedSlotIndex((current) => getIndexAfterRemove(current, index, next.length))
    setSelectedRuleRefIndex(null)
  }

  const handleMoveSlot = (fromIndex: number, toIndex: number) => {
    slots.onChange(normalizeSlotIndexes(moveArrayItem(slots.value, fromIndex, toIndex)))
    setSelectedSlotIndex((current) => getIndexAfterMove(current, fromIndex, toIndex))
  }

  const handleAddRuleRef = () => {
    if (selectedSlotIndex === null || !selectedSlot) return
    update(selectedSlotIndex, { ruleIds: [...selectedSlot.ruleIds, ""] })
    setSelectedRuleRefIndex(selectedSlot.ruleIds.length)
  }

  const handleRemoveRuleRef = (_key: ArrayEditorKey, index: number) => {
    if (selectedSlotIndex === null || !selectedSlot) return
    const next = selectedSlot.ruleIds.filter((_, idx) => idx !== index)
    update(selectedSlotIndex, { ruleIds: next })
    setSelectedRuleRefIndex((current) => getIndexAfterRemove(current, index, next.length))
  }

  const handleMoveRuleRef = (fromIndex: number, toIndex: number) => {
    if (selectedSlotIndex === null || !selectedSlot) return
    update(selectedSlotIndex, { ruleIds: moveArrayItem(selectedSlot.ruleIds, fromIndex, toIndex) })
    setSelectedRuleRefIndex((current) => getIndexAfterMove(current, fromIndex, toIndex))
  }

  useContribute(
    contribute,
    `tc-${tc.id}-slots`,
    (draft): Stored<TechnicalCondition> => ({
      ...draft,
      designationSlots: slots.value.map((s, i) => ({ ...s, index: i })),
    }),
  )

  return (
    <>
      <Text.Heading as="p" variant="02">
        Параметры условного обозначения
      </Text.Heading>
      <ArrayEditor
        items={slots.value}
        getKey={(_, i) => i}
        selected={selectedSlotIndex}
        onSelected={(key) => {
          setSelectedSlotIndex(keyToIndex(key))
          setSelectedRuleRefIndex(null)
        }}
        onAdd={handleAddSlot}
        onRemove={handleRemoveSlot}
        onMove={handleMoveSlot}
        renderLabel={(slot, i) => (
          <Stack gap={1}>
            <Text as="span" compact>
              {(slot.name ?? "").trim() || `Параметр ${i + 1}`}
            </Text>
            <Text.Helper as="span">
              {slot.ruleIds.length > 0
                ? `Правил определения: ${slot.ruleIds.length}`
                : "Правила определения не заданы"}
            </Text.Helper>
          </Stack>
        )}
        addLabel="Добавить параметр"
        helperText="Выберите параметр, чтобы изменить название и правила определения."
        disabled={isSaving}
        fluid
      />
      {selectedSlot && selectedSlotIndex !== null && (
        <Stack gap={1}>
          <Input
            label={`${selectedSlotIndex + 1} Название параметра`}
            placeholder="Напр. Климатическое исполнение"
            value={selectedSlot.name}
            onChange={(e) => update(selectedSlotIndex, { name: e.target.value })}
            disabled={isSaving}
            fluid
          />
          <ArrayEditor
            items={selectedSlot.ruleIds}
            getKey={(_, i) => i}
            selected={selectedRuleRefIndex}
            onSelected={(key) => setSelectedRuleRefIndex(keyToIndex(key))}
            onAdd={handleAddRuleRef}
            onRemove={handleRemoveRuleRef}
            onMove={handleMoveRuleRef}
            renderLabel={(ruleId, i) => {
              const rule = rules.value.find((r) => r.id === ruleId) ?? null

              return (
                <Stack gap={1}>
                  <Text as="span" compact>
                    {`Правило ${i + 1}`}
                  </Text>
                  <Text.Helper as="span">{ruleLabel(rule, ruleId || undefined)}</Text.Helper>
                </Stack>
              )
            }}
            label="Ссылки на правила определения значения параметра"
            addLabel="Добавить ссылку"
            emptyText="Ссылок на правила нет"
            disabled={isSaving}
            fluid
          />
          {selectedRuleRefIndex !== null && selectedRuleId !== undefined && (
            <Input.Dropdown<TechnicalConditionRule>
              items={rules.value}
              value={selectedRule}
              onChange={(next) => updateRuleId(selectedSlotIndex, selectedRuleRefIndex, next?.id ?? "")}
              getItemKey={(item) => item.id}
              disabled={isSaving}
              renderSelectedItem={(item) => (
                <Text as="span" compact>
                  {ruleLabel(item, selectedRuleId || undefined)}
                </Text>
              )}
              renderListItem={(item) => (
                <Text as="span" compact>
                  {ruleLabel(item)}
                </Text>
              )}
              fluid
            >
              <Input.Dropdown.Selected />
              <Input.Dropdown.List emptyText="Нет правил — добавьте в разделе «Правила»" />
            </Input.Dropdown>
          )}
        </Stack>
      )}
    </>
  )
}
