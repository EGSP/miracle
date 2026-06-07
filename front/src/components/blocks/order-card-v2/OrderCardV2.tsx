import { Stack, Text } from "@miracle/aramid"
import { useGetOrder } from "@/lib/queries/order.query"
import type { OrderCardV2Props } from "./OrderCardV2.types"
import { OrderCardV2Actions } from "./OrderCardV2Actions"
import { OrderCardV2Header } from "./OrderCardV2Header"
import { OrderInfoApplicationsBlock } from "./OrderInfoApplicationsBlock"
import { OrderProductsBlock } from "./OrderProductsBlock"

export function OrderCardV2({ orderId }: OrderCardV2Props) {
  const { data: order, isLoading } = useGetOrder(orderId)

  if (isLoading || !order) {
    return <Text.Helper as="p">Загрузка заказа…</Text.Helper>
  }

  return (
    <Stack gap={3}>
      <OrderCardV2Header order={order} />
      <OrderCardV2Actions orderId={order.id} />
      <OrderInfoApplicationsBlock orderId={order.id} />
      <OrderProductsBlock orderId={order.id} />
    </Stack>
  )
}
