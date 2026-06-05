import { Stack, Text } from "@miracle/aramid"
import type { OrderReportInfo } from "@miracle/types"
import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/ds/input"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { getApiErrorMessage } from "@/lib/api"
import { useDownloadOrderReport, useGetOrderReports } from "@/lib/queries/order.query"

type Props = {
  orderId: string
  onClose: () => void
}

const EMPTY_REPORTS: OrderReportInfo[] = []

export function OrderReportDialog({ orderId, onClose }: Props) {
  const reportsQuery = useGetOrderReports(orderId)
  const downloadMutation = useDownloadOrderReport(orderId)
  const reports = reportsQuery.data ?? EMPTY_REPORTS
  const [selectedReport, setSelectedReport] = useState<OrderReportInfo | null>(null)

  useEffect(() => {
    setSelectedReport((current) => {
      if (reports.length === 0) return null
      if (current && reports.some((report) => report.id === current.id)) return current
      return reports[0]
    })
  }, [reports])

  const helperText = useMemo(() => {
    if (reportsQuery.isPending) return "Загружаем список доступных отчетов…"
    if (reportsQuery.isError) return getApiErrorMessage(reportsQuery.error)
    if (reports.length === 0) return "Для этого заказа нет доступных отчетов."
    return "Выберите отчет и нажмите «Сформировать»."
  }, [reports.length, reportsQuery.error, reportsQuery.isError, reportsQuery.isPending])

  const handleGenerate = () => {
    if (!selectedReport) return
    downloadMutation.mutate(selectedReport.id)
  }

  const actions: DialogButtonConfig[] = [
    { label: "Закрыть", onClick: onClose, variant: "secondary" },
    {
      label: downloadMutation.isPending ? "Формирование…" : "Сформировать",
      onClick: handleGenerate,
      disabled: !selectedReport || reportsQuery.isPending || downloadMutation.isPending,
    },
  ]

  return (
    <Dialog
      title="Отчёт"
      description="Выберите формат отчёта и сформируйте Excel-файл."
      size="md"
      onClose={onClose}
      actions={actions}
    >
      <Stack gap={3}>
        <Input.Dropdown<OrderReportInfo>
          label="Тип отчёта"
          items={reports}
          value={selectedReport}
          onChange={setSelectedReport}
          getItemKey={(report) => report.id}
          renderSelectedItem={(report) => report?.name ?? "Выберите отчёт"}
          renderListItem={(report) => (
            <Text as="span" compact>
              {report?.name ?? "Не выбрано"}
            </Text>
          )}
          helperText={helperText}
          disabled={reportsQuery.isPending || downloadMutation.isPending || reports.length === 0}
          fluid
        >
          <Input.Dropdown.Selected />
          <Input.Dropdown.List emptyText="Нет доступных отчетов" />
        </Input.Dropdown>
        <InlineMutationNotification
          mutation={downloadMutation}
          successMessage="Отчёт сформирован."
        />
      </Stack>
    </Dialog>
  )
}
