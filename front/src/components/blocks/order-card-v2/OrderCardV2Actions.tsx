import { Stack } from "@miracle/aramid"
import { useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { ButtonGroup } from "@/components/ui/ds/button-group"
import { OrderAnalyseDialog } from "./OrderAnalyseDialog"
import { OrderReportDialog } from "./OrderReportDialog"

export function OrderCardV2Actions({ orderId }: { orderId: string }) {
  const [analyseDialogOpen, setAnalyseDialogOpen] = useState(false)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)

  return (
    <Stack gap={2}>
      <ButtonGroup condensed>
        <Button
          variant="primary"
          size="sm"
          label="Анализ"
          onClick={() => setAnalyseDialogOpen(true)}
        />
        <Button
          variant="secondary"
          size="sm"
          label="Отчёт"
          onClick={() => setReportDialogOpen(true)}
        />
      </ButtonGroup>
      {analyseDialogOpen && (
        <OrderAnalyseDialog orderId={orderId} onClose={() => setAnalyseDialogOpen(false)} />
      )}
      {reportDialogOpen && (
        <OrderReportDialog orderId={orderId} onClose={() => setReportDialogOpen(false)} />
      )}
    </Stack>
  )
}
