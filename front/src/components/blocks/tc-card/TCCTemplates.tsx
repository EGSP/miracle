import { Stack, Text } from "@miracle/aramid"
import type { DisplayTemplate, Stored, TechnicalCondition } from "@miracle/types"
import { ArrayEditor } from "@/components/ui/array-editor"
import { Input } from "@/components/ui/input"
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

  const update = (i: number, patch: Partial<DisplayTemplate>) =>
    templates.onChange(templates.value.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))

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
        onAdd={() => templates.onChange([...templates.value, makeTemplate()])}
        onRemove={(i) => templates.onChange(templates.value.filter((_, idx) => idx !== i))}
        renderItem={(tmpl, i) => (
          <Stack gap={1}>
            <Input
              label="Название"
              placeholder="Напр. Полное"
              value={tmpl.name}
              onChange={(e) => update(i, { name: e.target.value })}
              disabled={isSaving}
            />
            <Input
              label="Строка шаблона"
              placeholder="Напр. [1] [2]-[3]-...-[10]"
              value={tmpl.format ?? ""}
              onChange={(e) => update(i, { format: e.target.value })}
              disabled={isSaving}
            />
            <Text.Helper as="p">
              Используйте 1-based плейсхолдеры вида [1], [2], [3] и т.д.
            </Text.Helper>
          </Stack>
        )}
        addLabel="Добавить шаблон"
        disabled={isSaving}
      />
    </Stack>
  )
}
