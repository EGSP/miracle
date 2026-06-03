import { Text } from "@miracle/aramid"
import { AlertCircle, CheckCircle2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { getApiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

type Mutation = {
  isError: boolean
  isSuccess: boolean
  error?: unknown
}

type InlineMutationNotificationProps = {
  mutation: Mutation
  successMessage?: string
  className?: string
}

export function InlineMutationNotification({
  mutation,
  successMessage,
  className,
}: InlineMutationNotificationProps) {
  const [dismissed, setDismissed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    setDismissed(false)
  }, [mutation.isError, mutation.isSuccess])

  if (dismissed) return null

  if (mutation.isError) {
    const message = getApiErrorMessage(mutation.error as Error)
    const detailsActions: DialogButtonConfig[] = [
      { label: "Закрыть", onClick: () => setDetailsOpen(false), variant: "secondary" },
    ]

    return (
      <>
        <div
          className={cn(
            "flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive",
            className,
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1 text-xs line-clamp-2">{message}</p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              label="Подробнее"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDetailsOpen(true)}
            />
            <Button
              variant="icon-button"
              size="xs"
              icon={<X />}
              label="Закрыть"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDismissed(true)}
            />
          </div>
        </div>
        {detailsOpen && (
          <Dialog
            title="Ошибка"
            size="sm"
            onClose={() => setDetailsOpen(false)}
            actions={detailsActions}
          >
            <Text.Helper as="p" className="break-words">
              {message}
            </Text.Helper>
          </Dialog>
        )}
      </>
    )
  }

  if (mutation.isSuccess && successMessage) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-green-700 dark:text-green-400",
          className,
        )}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 flex-1 text-xs line-clamp-2">{successMessage}</p>
        <Button
          variant="icon-button"
          size="xs"
          icon={<X />}
          label="Закрыть"
          className="shrink-0 text-green-700 hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
          onClick={() => setDismissed(true)}
        />
      </div>
    )
  }

  return null
}
