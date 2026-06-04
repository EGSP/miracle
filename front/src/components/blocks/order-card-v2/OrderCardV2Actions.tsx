import { Stack } from "@miracle/aramid"
import { Button } from "@/components/ui/ds/button"
import { ButtonGroup } from "@/components/ui/ds/button-group"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useAnalyseOrder } from "@/lib/queries/order.query"

export function OrderCardV2Actions({ orderId }: { orderId: string }) {
  const analyseMutation = useAnalyseOrder(orderId)

  return (
    <Stack gap={2}>
      <ButtonGroup condensed>
        <Button
          variant="primary"
          size="sm"
          label={analyseMutation.isPending ? "Запуск…" : "Анализ"}
          disabled={analyseMutation.isPending}
          onClick={() => analyseMutation.mutate({})}
        />
      </ButtonGroup>
      <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
    </Stack>
  )
}
