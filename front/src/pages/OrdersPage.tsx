import { Column, Grid, Stack, Text } from "@miracle/aramid"
import type { Order, Stored } from "@miracle/types"
import { orderDisplayName } from "@miracle/types"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { ListOrdered, Plus } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { OrderCardV2 } from "@/components/blocks/order-card-v2/OrderCardV2"
import { Button } from "@/components/ui/ds/button"
import {
  type ListDefinition,
  StructuredList,
  type StructuredListKey,
} from "@/components/ui/ds/structured-list"
import { useCreateOrder, useGetOrders } from "@/lib/queries/order.query"
import { useGetUser } from "@/lib/queries/user.query"

const COL_LIST = 4 as const
const COL_CARD = 12 as const

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function OrderAuthorCell({ authorId }: { authorId: string }) {
  const { data: author } = useGetUser(authorId)
  return <Text.Label as="span">{author?.login ?? authorId}</Text.Label>
}

const orderListDefinition: ListDefinition<Stored<Order>> = {
  getKey: (order) => order.id,
  columns: [
    {
      key: "icon",
      width: "28px",
      render: () => <ListOrdered className="size-4 shrink-0 text-muted-foreground" />,
    },
    {
      key: "name",
      label: "Название",
      width: "4fr",
      render: (order) => (
        <Text.Label as="span" className="order-list__name">
          {orderDisplayName(order)}
        </Text.Label>
      ),
    },
    {
      key: "info",
      width: "2fr",
      rows: [
        {
          key: "author",
          label: "Автор",
          weight: "1fr",
          render: (order) => <OrderAuthorCell authorId={order.authorId} />,
        },
        {
          key: "date",
          label: "Дата",
          weight: "1fr",
          render: (order) => <Text.Helper as="span">{formatDate(order.createdAt)}</Text.Helper>,
        },
      ],
    },
  ],
}

export default function OrdersPage() {
  const { orderId: orderIdParam } = useSearch({ from: "/orders" })
  const navigate = useNavigate({ from: "/orders" })
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orderIdParam ?? null)

  const { data: orders, isLoading, error } = useGetOrders()
  const createOrderMutation = useCreateOrder()

  const selected: StructuredListKey[] = useMemo(
    () => (selectedOrderId ? [selectedOrderId] : []),
    [selectedOrderId],
  )

  const select = useCallback(
    (id: string | null) => {
      setSelectedOrderId(id)
      void navigate({ search: (prev) => ({ ...prev, orderId: id ?? undefined }) })
    },
    [navigate],
  )

  const handleCreateOrder = () => {
    createOrderMutation.mutate(undefined, {
      onSuccess: (created) => select(created.id),
    })
  }

  const handleSelected = useCallback(
    (keys: StructuredListKey[]) => select((keys[0] as string) ?? null),
    [select],
  )

  // Синхронизация выбора с URL-параметром при загрузке.
  useEffect(() => {
    if (orderIdParam) setSelectedOrderId(orderIdParam)
  }, [orderIdParam])

  return (
    <Grid as="main" fullWidth withRowGap>
      <Column span={16}>
        <Text.Heading as="h1" variant="02">
          Заказы
        </Text.Heading>
      </Column>

      <Column span={COL_LIST}>
        <Stack as="section" gap={3}>
          <Stack orientation="horizontal" gap={3} className="items-center justify-between">
            <Text.Heading as="h2" variant="compact-01">
              Список заказов
            </Text.Heading>
            <Button
              icon={<Plus />}
              label={createOrderMutation.isPending ? "Создание…" : "Новый"}
              size="sm"
              onClick={handleCreateOrder}
              disabled={createOrderMutation.isPending}
            />
          </Stack>

          {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
          {error && <Text.Helper as="p">Ошибка: {error.message}</Text.Helper>}
          {!isLoading && !error && (!orders || orders.length === 0) && (
            <Text.Helper as="p">Нет заказов</Text.Helper>
          )}
          {orders && orders.length > 0 && (
            <StructuredList
              definition={orderListDefinition}
              items={orders}
              selected={selected}
              onSelected={handleSelected}
              overflow={8}
            />
          )}
        </Stack>
      </Column>

      <Column span={COL_CARD}>
        {selectedOrderId ? (
          <OrderCardV2 orderId={selectedOrderId} />
        ) : (
          <Text.Helper as="p">Выберите заказ в списке, чтобы открыть карточку.</Text.Helper>
        )}
      </Column>
    </Grid>
  )
}
