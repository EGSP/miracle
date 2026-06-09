import { Stack } from "@miracle/aramid"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/ds/button"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useGuardState } from "@/contexts/dirty-state/DirtyGuardContext"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

export function TCCActions() {
  const { isSaving, save, saveError, isDeleting, deleteError, deleteTc } =
    useTechnicalConditionCardContext()
  const { isDirtyAnywhere } = useGuardState()

  const handleDelete = () => {
    if (!window.confirm("Удалить ТУ? Запись будет скрыта из списка (мягкое удаление).")) {
      return
    }
    deleteTc()
  }

  return (
    <Stack gap={2}>
      <Stack orientation="horizontal" gap={2}>
        <Button
          type="button"
          size="md"
          label={isSaving ? "Сохранение..." : "Сохранить ТУ"}
          disabled={!isDirtyAnywhere || isSaving || isDeleting}
          onClick={save}
        />
        <Button
          type="button"
          size="md"
          variant="danger-tertiary"
          icon={<Trash2 />}
          label={isDeleting ? "Удаление..." : "Удалить"}
          disabled={isDeleting}
          onClick={handleDelete}
        />
      </Stack>

      <InlineMutationNotification
        mutation={{ isError: !!saveError, isSuccess: false, error: saveError }}
      />

      <InlineMutationNotification
        mutation={{ isError: !!deleteError, isSuccess: false, error: deleteError }}
      />
    </Stack>
  )
}
