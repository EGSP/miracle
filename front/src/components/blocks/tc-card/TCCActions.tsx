import { Stack } from "@miracle/aramid"
import { ScanText, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/ds/button"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useGuardState } from "@/contexts/dirty-state/DirtyGuardContext"
import { useExtractTcDetails } from "@/lib/queries/technical-condition.query"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

export function TCCActions() {
  const { technicalCondition, isSaving, save, saveError, isDeleting, deleteError, deleteTc } =
    useTechnicalConditionCardContext()
  const { isDirtyAnywhere } = useGuardState()

  const extractMutation = useExtractTcDetails(technicalCondition.id)

  const handleDelete = () => {
    if (!window.confirm("Удалить ТУ? Запись будет скрыта из списка (мягкое удаление).")) {
      return
    }
    deleteTc()
  }

  return (
    <Stack gap={2}>
      <Stack orientation="horizontal" gap={2} className="items-center  flex-wrap">
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
          variant="secondary"
          icon={<ScanText />}
          label={extractMutation.isPending ? "Запуск..." : "Сканировать"}
          disabled={!technicalCondition.fileId || extractMutation.isPending || isDeleting}
          title={
            !technicalCondition.fileId
              ? "Сначала прикрепите PDF-файл ТУ"
              : "Запустить LLM-анализ: извлечь секции ТУ в правила параметров (перезапишет текущий список)"
          }
          onClick={() => extractMutation.mutate()}
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
        mutation={{
          isError: extractMutation.isError,
          isSuccess: extractMutation.isSuccess,
          error: extractMutation.error,
        }}
        successMessage="Воркер запущен — статус виден на странице Воркеры"
      />

      <InlineMutationNotification
        mutation={{ isError: !!saveError, isSuccess: false, error: saveError }}
      />

      <InlineMutationNotification
        mutation={{ isError: !!deleteError, isSuccess: false, error: deleteError }}
      />
    </Stack>
  )
}
