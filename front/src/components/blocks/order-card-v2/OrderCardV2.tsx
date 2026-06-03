import { Stack, Text } from "@miracle/aramid"
import { useGetOrder } from "@/lib/queries/order.query"
import { ApplicationsTile } from "./applications/ApplicationsTile"
import { OrderCardV2Header } from "./OrderCardV2Header"
import type { OrderCardV2Props } from "./OrderCardV2.types"

export function OrderCardV2({ orderId }: OrderCardV2Props) {
  const { data: order, isLoading } = useGetOrder(orderId)

  if (isLoading || !order) {
    return <Text.Helper as="p">Загрузка заказа…</Text.Helper>
  }

  return (
    <Stack gap={3}>
      <OrderCardV2Header order={order} />
      <ApplicationsTile orderId={order.id} />
    </Stack>
  )
}
