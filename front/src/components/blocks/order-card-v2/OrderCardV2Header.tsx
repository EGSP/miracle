import { Stack, Text } from "@miracle/aramid"
import type { Order, Stored } from "@miracle/types"
import { useGetUser } from "@/lib/queries/user.query"

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function OrderCardV2Header({ order }: { order: Stored<Order> }) {
  const { data: author } = useGetUser(order.authorId)

  return (
    <Stack orientation="horizontal" gap={4}>
      <Text as="span" compact>
        {author?.login ?? order.authorId}
      </Text>
      <Text.Helper as="span">{formatDate(order.createdAt)}</Text.Helper>
    </Stack>
  )
}
