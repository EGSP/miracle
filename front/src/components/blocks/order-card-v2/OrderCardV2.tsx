import { Stack, Text } from "@miracle/aramid"
import { useGetOrder } from "@/lib/queries/order.query"
import { ApplicationsTile } from "./applications/ApplicationsTile"
import type { OrderCardV2Props } from "./OrderCardV2.types"
import { OrderCardV2Actions } from "./OrderCardV2Actions"
import { OrderCardV2Header } from "./OrderCardV2Header"
import { OrderJobTile } from "./OrderJobTile"

export function OrderCardV2({ orderId }: OrderCardV2Props) {
  const { data: order, isLoading } = useGetOrder(orderId)

  if (isLoading || !order) {
    return <Text.Helper as="p">Загрузка заказа…</Text.Helper>
  }

  return (
    <Stack gap={3}>
      <OrderCardV2Header order={order} />
      <OrderCardV2Actions orderId={order.id} />
      <ApplicationsTile orderId={order.id} />
      <OrderJobTile orderId={order.id} />
    </Stack>
  )
}
