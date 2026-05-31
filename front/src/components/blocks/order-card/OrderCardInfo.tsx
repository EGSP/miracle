import { Stack, Text } from "@miracle/aramid"
import type { Order, Stored } from "@miracle/types"
import { useGetUser } from "@/lib/queries/user.query"
import { useOrderCardContext } from "./OrderCard"

function formatCreatedAt(unixMs: number): string {
  return new Date(unixMs).toLocaleString()
}

export function OrderCardInfo() {
  const { order } = useOrderCardContext()
  const { data: author } = useGetUser(order.authorId)

  return (
    <Stack gap={1}>
      <Text.Label as="span">ID заказа: {order.id}</Text.Label>
      <Text.Label as="span">Дата создания: {formatCreatedAt(order.createdAt)}</Text.Label>
      <Text.Label as="span">Автор: {author?.login ?? order.authorId}</Text.Label>
    </Stack>
  )
}
