import { Stack, Text } from "@miracle/aramid"
import type { DisplayTemplate, Stored, TechnicalCondition } from "@miracle/types"
import { useEffect, useState } from "react"
import { ArrayEditor, moveArrayItem, type ArrayEditorKey } from "@/components/ui/derivations"
import { Input } from "@/components/ui/ds/input"
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { createUuid } from "@/lib/uuid"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

function makeTemplate(): DisplayTemplate {
  return { id: createUuid(), name: "", format: "" }
}

export function TCCTemplates() {
  const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext()
  const tc = technicalCondition

  const templates = useField<DisplayTemplate[]>(`tc-${tc.id}-templates`, tc.displayTemplates ?? [])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates.value[0]?.id ?? null,
  )

  useEffect(() => {
    if (!templates.value.length) {
      if (selectedTemplateId !== null) setSelectedTemplateId(null)
      return
    }
    if (selectedTemplateId === null) return
    if (templates.value.some((template) => template.id === selectedTemplateId)) {
      return
    }
    setSelectedTemplateId(templates.value[0]?.id ?? null)
  }, [templates.value, selectedTemplateId])

  const selectedTemplateIndex = selectedTemplateId
    ? templates.value.findIndex((template) => template.id === selectedTemplateId)
    : -1
  const selectedTemplate = selectedTemplateIndex >= 0 ? templates.value[selectedTemplateIndex] : null

  const update = (templateId: string, patch: Partial<DisplayTemplate>) =>
    templates.onChange(templates.value.map((t) => (t.id === templateId ? { ...t, ...patch } : t)))

  const handleAdd = () => {
    const nextTemplate = makeTemplate()
    templates.onChange([...templates.value, nextTemplate])
    setSelectedTemplateId(nextTemplate.id)
  }

  const handleRemove = (key: ArrayEditorKey, index: number) => {
    const next = templates.value.filter((template) => template.id !== key)
    templates.onChange(next)
    if (selectedTemplateId === key) {
      setSelectedTemplateId(next[Math.min(index, next.length - 1)]?.id ?? null)
    }
  }

  useContribute(
    contribute,
    `tc-${tc.id}-templates`,
    (draft): Stored<TechnicalCondition> => ({
      ...draft,
      displayTemplates: templates.value,
    }),
  )

  return (
    <Stack gap={1}>
      <Text.Heading as="p" variant="02">
        Шаблоны отображения
      </Text.Heading>
      <ArrayEditor
        items={templates.value}
        getKey={(template) => template.id}
        selected={selectedTemplateId}
        onSelected={(key) => setSelectedTemplateId(typeof key === "string" ? key : null)}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onMove={(fromIndex, toIndex) =>
          templates.onChange(moveArrayItem(templates.value, fromIndex, toIndex))
        }
        renderLabel={(tmpl, i) => (
          <Stack gap={1}>
            <Text as="span" compact>
              {(tmpl.name ?? "").trim() || `Шаблон ${i + 1}`}
            </Text>
            <Text.Helper as="span">{tmpl.format || "Строка шаблона не задана"}</Text.Helper>
          </Stack>
        )}
        addLabel="Добавить шаблон"
        helperText="Выберите шаблон, чтобы изменить название и строку формата."
        disabled={isSaving}
        fluid
      />
      {selectedTemplate && (
        <Stack gap={1}>
          <Input
            label="Название"
            placeholder="Напр. Полное"
            value={selectedTemplate.name}
            onChange={(e) => update(selectedTemplate.id, { name: e.target.value })}
            disabled={isSaving}
            fluid
          />
          <Input
            label="Строка шаблона"
            placeholder="Напр. [1] [2]-[3]-...-[10]"
            value={selectedTemplate.format ?? ""}
            onChange={(e) => update(selectedTemplate.id, { format: e.target.value })}
            disabled={isSaving}
            fluid
          />
          <Text.Helper as="p">
            Используйте 1-based плейсхолдеры вида [1], [2], [3] и т.д.
          </Text.Helper>
        </Stack>
      )}
    </Stack>
  )
}
