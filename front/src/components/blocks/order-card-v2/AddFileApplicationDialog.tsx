import { Stack } from "@miracle/aramid"
import { getAllowedExtensions } from "@miracle/types"
import { useMemo } from "react"
import { FileInput } from "@/components/ui/file-input"
import { Dialog, type DialogButtonConfig } from "@/components/ui/modal-dialog"
import { useApplicationFileUpload } from "@/lib/hooks/useApplicationFileUpload"

type Props = {
  orderId: string
  onClose: () => void
}

export function AddFileApplicationDialog({ orderId, onClose }: Props) {
  const { fileStates, onFilesApplied, onRemove, upload, hasApplied, isUploading } =
    useApplicationFileUpload(orderId)

  const extensions = useMemo(() => getAllowedExtensions(), [])

  const actions: DialogButtonConfig[] = [
    { label: "Закрыть", onClick: onClose, variant: "secondary" },
    {
      label: isUploading ? "Загрузка…" : "Загрузить",
      onClick: upload,
      disabled: !hasApplied || isUploading,
    },
  ]

  return (
    <Dialog
      title="Файловое приложение"
      // label временно играет роль описания диалога (потом — отдельный проп description в modal-dialog).
      label="Файлы загрузятся и прикрепятся к заказу как приложения."
      size="md"
      onClose={onClose}
      actions={actions}
    >
      <Stack gap={3}>
        <FileInput
          variant="drop-zone"
          multiple
          extensions={extensions}
          fileStates={fileStates}
          onFilesApplied={onFilesApplied}
          onRemove={onRemove}
          disabled={isUploading}
          fluid
        >
          <FileInput.Zone />
          <FileInput.List />
        </FileInput>
      </Stack>
    </Dialog>
  )
}
