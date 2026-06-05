import { Stack } from "@miracle/aramid"
import { Button } from "@/components/ui/ds/button"
import { ButtonGroup } from "@/components/ui/ds/button-group"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useAnalyseOrder, useDownloadOrderReport } from "@/lib/queries/order.query"

export function OrderCardV2Actions({ orderId }: { orderId: string }) {
  const analyseMutation = useAnalyseOrder(orderId)
  const reportMutation = useDownloadOrderReport(orderId)

  return (
    <Stack gap={2}>
      <ButtonGroup condensed>
        <Button
          variant="primary"
          size="sm"
          label={analyseMutation.isPending ? "Запуск…" : "Анализ"}
          disabled={analyseMutation.isPending}
          onClick={() => analyseMutation.mutate({ deleteJobs: true, deleteFileContent: true })}
        />
        <Button
          variant="secondary"
          size="sm"
          label={reportMutation.isPending ? "Формирование…" : "Отчёт"}
          disabled={reportMutation.isPending}
          onClick={() => reportMutation.mutate()}
        />
      </ButtonGroup>
      <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
      <InlineMutationNotification mutation={reportMutation} successMessage="Отчёт сформирован" />
    </Stack>
  )
}
