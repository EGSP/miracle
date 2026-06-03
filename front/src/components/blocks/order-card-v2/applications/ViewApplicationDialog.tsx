import { Text } from "@miracle/aramid"
import { hasDeletion, type ApplicationData, type OrderApplication, type Stored } from "@miracle/types"
import { Trash2 } from "lucide-react"
import { useCallback, useMemo } from "react"
import type { ReactNode } from "react"

import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { Textarea } from "@/components/ui/ds/textarea"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { FileContentPreview } from "@/components/ui/external/file-content-preview"
import { useDialog } from "@/lib/hooks/use-dialog"
import { resolveFilePreviewUrl } from "@/lib/resolve-file-preview-url"
import { useRemoveApplication } from "@/lib/queries/order-application.query"
import { useGetFiles } from "@/lib/queries/file.query"

const REMOVE_SUCCESS_MESSAGE = "Приложение удалено. Закройте диалог, когда будете готовы."

type Props = {
  application: Stored<OrderApplication>
  onClose: () => void
}

function useViewApplicationActions(application: Stored<OrderApplication>, onClose: () => void) {
  const removeMutation = useRemoveApplication(application.orderId)
  const data = application.data as ApplicationData
  const isRemoved = hasDeletion(application) || removeMutation.isSuccess

  const canRemove = useMemo(() => {
    if (isRemoved || removeMutation.isPending) {
      return false
    }
    if (data.type === "text") {
      return data.text.trim().length > 0
    }
    return true
  }, [isRemoved, data, removeMutation.isPending])

  const actions: DialogButtonConfig[] = [
    {
      label: "Закрыть",
      onClick: onClose,
      variant: "secondary",
      disabled: removeMutation.isPending,
    },
    {
      label: removeMutation.isPending ? "Удаление…" : "Удалить",
      icon: <Trash2 size={16} />,
      variant: "danger",
      onClick: () => {
        removeMutation.mutate(application.id)
      },
      disabled: !canRemove,
    },
  ]

  return { actions, removeMutation, isRemoved }
}

function ApplicationDialogFooter({
  removeMutation,
  children,
}: {
  removeMutation: ReturnType<typeof useRemoveApplication>
  children: ReactNode
}) {
  return (
    <>
      {children}
      {removeMutation.isSuccess && (
        <Text.Helper as="p">{REMOVE_SUCCESS_MESSAGE}</Text.Helper>
      )}
      <InlineMutationNotification mutation={removeMutation} />
    </>
  )
}

function ViewTextApplicationDialog({
  application,
  text,
  onClose,
}: {
  application: Stored<OrderApplication>
  text: string
  onClose: () => void
}) {
  const { actions, removeMutation } = useViewApplicationActions(application, onClose)

  return (
    <Dialog
      title="Текстовое приложение"
      size="lg"
      onClose={onClose}
      actions={actions}
    >
      <ApplicationDialogFooter removeMutation={removeMutation}>
        <Textarea
          label="Текст"
          value={text}
          readOnly
          size="lg"
          fluid
          resizable={false}
        />
      </ApplicationDialogFooter>
    </Dialog>
  )
}

function ViewFileApplicationDialog({
  application,
  fileId,
  onClose,
}: {
  application: Stored<OrderApplication>
  fileId: string
  onClose: () => void
}) {
  const { actions, removeMutation } = useViewApplicationActions(application, onClose)
  const { data: files = [], isPending, isError } = useGetFiles({
    id: fileId,
    includeMeta: true,
  })
  const file = files[0]

  return (
    <Dialog
      title={file?.name ?? "Файловое приложение"}
      size="lg"
      onClose={onClose}
      actions={actions}
    >
      <ApplicationDialogFooter removeMutation={removeMutation}>
        {isPending && <Text.Helper as="p">Загрузка файла…</Text.Helper>}
        {isError && <Text.Helper as="p">Не удалось загрузить файл</Text.Helper>}
        {!isPending && !isError && file && (
          <FileContentPreview file={file} resolveUrl={resolveFilePreviewUrl} />
        )}
        {!isPending && !isError && !file && (
          <Text.Helper as="p">Файл не найден</Text.Helper>
        )}
      </ApplicationDialogFooter>
    </Dialog>
  )
}

export function ViewApplicationDialog({ application, onClose }: Props) {
  const data = application.data as ApplicationData

  if (data.type === "text") {
    return (
      <ViewTextApplicationDialog application={application} text={data.text} onClose={onClose} />
    )
  }

  return (
    <ViewFileApplicationDialog application={application} fileId={data.fileId} onClose={onClose} />
  )
}

/**
 * Открывает просмотр приложения заказа в Carbon Dialog (lg).
 *
 * Зачем отдельный хук: `ApplicationItem` не дублирует связку `useDialog` + `ViewApplicationDialog`.
 * Один вход — `viewApplication(application)` (текст read-only, файл — image/pdf preview).
 */
export function useViewApplication() {
  const { open } = useDialog()

  const viewApplication = useCallback(
    (application: Stored<OrderApplication>) => {
      open(({ close }) => (
        <ViewApplicationDialog application={application} onClose={close} />
      ))
    },
    [open],
  )

  return { viewApplication }
}
