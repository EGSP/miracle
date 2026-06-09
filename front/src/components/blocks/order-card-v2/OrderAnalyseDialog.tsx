import { Stack } from "@miracle/aramid"
import { isJobStatusActive } from "@/components/blocks/job-tree/job-tree.utils"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useAnalyseOrder, usePollOrderJob } from "@/lib/queries/order.query"
import { OrderAnalyseProgress } from "./OrderAnalyseProgress"

type Props = {
  orderId: string
  onClose: () => void
}

export function OrderAnalyseDialog({ orderId, onClose }: Props) {
  const analyseMutation = useAnalyseOrder(orderId)
  const { data: run, isLoading } = usePollOrderJob(orderId)
  const hasActiveRun = run ? isJobStatusActive(run.status) : false

  const handleStart = () => {
    analyseMutation.mutate({ deleteJobs: true, deleteFileContent: true })
  }

  const actions: DialogButtonConfig[] = [
    { label: "Отмена", onClick: onClose, variant: "secondary" },
    {
      label: analyseMutation.isPending ? "Запуск..." : "Запустить анализ",
      onClick: handleStart,
      disabled: analyseMutation.isPending || isLoading || hasActiveRun,
    },
  ]

  const description = hasActiveRun
    ? "Сейчас анализ уже выполняется. Дождитесь его завершения — после этого кнопка запуска снова станет доступна."
    : "Будет запущен новый анализ заказа. Предыдущие результаты и промежуточные извлечения из файлов будут очищены и заменены новыми."

  return (
    <Dialog
      title="Запуск анализа заказа"
      description={description}
      size="md"
      onClose={onClose}
      actions={actions}
    >
      <Stack gap={3}>
        {hasActiveRun && <OrderAnalyseProgress orderId={orderId} />}
        <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
      </Stack>
    </Dialog>
  )
}
