import { Stack } from "@miracle/aramid"
import { useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { ButtonGroup } from "@/components/ui/ds/button-group"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useAnalyseOrder } from "@/lib/queries/order.query"
import { OrderReportDialog } from "./OrderReportDialog"

export function OrderCardV2Actions({ orderId }: { orderId: string }) {
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const analyseMutation = useAnalyseOrder(orderId)

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
          label="Отчёт"
          onClick={() => setReportDialogOpen(true)}
        />
      </ButtonGroup>
      <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
      {reportDialogOpen && (
        <OrderReportDialog orderId={orderId} onClose={() => setReportDialogOpen(false)} />
      )}
    </Stack>
  )
}
