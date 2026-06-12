import { Stack, Text } from "@miracle/aramid"
import {
  hasDeletion,
  type ApplicationData,
  type FileModel,
  type OrderApplication,
  type PrepareStatus,
  type Stored,
} from "@miracle/types"
import { Link } from "@tanstack/react-router"
import { ScanText, Trash2 } from "lucide-react"
import { useCallback, useMemo } from "react"
import type { ReactNode } from "react"

import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { Textarea } from "@/components/ui/ds/textarea"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { FileContentPreview } from "@/components/ui/external/file-content-preview"
import { useDialog } from "@/lib/hooks/use-dialog"
import { resolveFileDownloadUrl, resolveFilePreviewUrl } from "@/lib/resolve-file-preview-url"
import {
  canEnqueuePrepare,
  isDocumentPrepared,
  preparedDocumentPreviewSearch,
  usePrepareDocument,
  usePreparedStatus,
} from "@/lib/queries/document-prepare.query"
import { useRemoveApplication } from "@/lib/queries/order-application.query"
import { useGetFiles } from "@/lib/queries/file.query"

const REMOVE_SUCCESS_MESSAGE = "Приложение удалено. Закройте диалог, когда будете готовы."

type Props = {
  application: Stored<OrderApplication>
  onClose: () => void
}

function useViewApplicationActions(
  application: Stored<OrderApplication>,
  onClose: () => void,
  middleActions: DialogButtonConfig[] = [],
) {
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
    ...middleActions,
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
  prepareMutation,
  children,
}: {
  removeMutation: ReturnType<typeof useRemoveApplication>
  prepareMutation?: ReturnType<typeof usePrepareDocument>
  children: ReactNode
}) {
  return (
    <>
      {children}
      {removeMutation.isSuccess && (
        <Text.Helper as="p">{REMOVE_SUCCESS_MESSAGE}</Text.Helper>
      )}
      {prepareMutation && <InlineMutationNotification mutation={prepareMutation} />}
      <InlineMutationNotification mutation={removeMutation} />
    </>
  )
}

function FileApplicationLinks({
  file,
  fileId,
  status,
}: {
  file: FileModel | undefined
  fileId: string
  status: PrepareStatus | null
}) {
  const canPreview = isDocumentPrepared(status)

  return (
    <Stack orientation="horizontal" gap={3}>
      <Text.Helper as="span">
        {file ? (
          <a href={resolveFileDownloadUrl(file)} rel="noopener noreferrer">
            Скачать файл
          </a>
        ) : (
          "Скачивание недоступно"
        )}
      </Text.Helper>
      <Text.Helper as="span">
        {canPreview ? (
          <Link
            to="/prepared-document"
            search={preparedDocumentPreviewSearch(fileId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Просмотр разметки
          </Link>
        ) : (
          "Просмотр разметки недоступен"
        )}
      </Text.Helper>
    </Stack>
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
  const { data: files = [], isPending, isError } = useGetFiles({
    id: fileId,
    includeMeta: true,
  })
  const file = files[0]
  const {
    data: prepareStatus,
    isPending: isPrepareStatusPending,
  } = usePreparedStatus(fileId)
  const prepareMutation = usePrepareDocument(fileId)
  const status = prepareStatus?.status ?? null

  const middleActions: DialogButtonConfig[] = [
    {
      label: "Подготовить",
      icon: <ScanText size={16} />,
      variant: "secondary",
      disabled: isPrepareStatusPending || !canEnqueuePrepare(status, prepareMutation.isPending),
      onClick: () => {
        prepareMutation.mutate()
      },
    },
  ]

  const { actions, removeMutation } = useViewApplicationActions(
    application,
    onClose,
    middleActions,
  )

  return (
    <Dialog
      title={file?.name ?? "Файловое приложение"}
      size="lg"
      onClose={onClose}
      actions={actions}
    >
      <ApplicationDialogFooter removeMutation={removeMutation} prepareMutation={prepareMutation}>
        <FileApplicationLinks file={file} fileId={fileId} status={status} />
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
