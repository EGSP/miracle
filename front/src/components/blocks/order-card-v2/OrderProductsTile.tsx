import { Stack, Text } from "@miracle/aramid"
import type { OrderPositionData, OrderPositionWithDesignation } from "@miracle/types"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { CircleCheck } from "lucide-react"
import { useCallback } from "react"
import {
  type ListDefinition,
  StructuredList,
  type StructuredListKey,
} from "@/components/ui/ds/structured-list"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrderPositions } from "@/lib/queries/order.query"
import "./order-products.css"

/** Количество + единица измерения одной строкой: "10 шт", "шт", "5", «—» если нет данных. */
function formatQuantity(data: OrderPositionData): string {
  const parts = [data.quantity?.trim(), data.unit?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : "—"
}

const positionListDefinition: ListDefinition<OrderPositionWithDesignation> = {
  getKey: (it) => it.position.id,
  columns: [
    {
      key: "info",
      width: "1fr",
      rows: [
        {
          key: "name",
          label: "Позиция",
          weight: "1fr",
          render: (it) => (
            <Text.Label as="span" expressive className="order-products__name">
              {it.position.name}
            </Text.Label>
          ),
        },
        {
          key: "type",
          label: "Тип продукции",
          weight: "1fr",
          render: (it) => (
            <Text.Helper as="span" className="order-products__name">
              {it.position.productTypeName ?? "Без типа"}
            </Text.Helper>
          ),
        },
      ],
    },
    {
      key: "qty",
      label: "Кол-во",
      width: "88px",
      render: (it) => <Text.Helper as="span">{formatQuantity(it.position.data)}</Text.Helper>,
    },
    {
      key: "mark",
      width: "56px",
      render: (it) =>
        it.designation ? (
          <span className="order-products__mark" title="Обозначение определено">
            <CircleCheck className="size-4" />
          </span>
        ) : (
          <span className="order-products__mark--empty" title="Обозначение не определено">
            —
          </span>
        ),
    },
  ],
}

/** Левый тайл блока продукции: список позиций заказа с отметкой наличия обозначения. */
export function OrderProductsTile({ orderId }: { orderId: string }) {
  const { positionId } = useSearch({ from: "/orders" })
  const navigate = useNavigate({ from: "/orders" })
  const { data: items, isLoading, error } = useGetOrderPositions(orderId)

  const selected: StructuredListKey[] = positionId ? [positionId] : []

  const handleSelected = useCallback(
    (keys: StructuredListKey[]) => {
      const next = (keys[0] as string | undefined) ?? undefined
      void navigate({ search: (prev) => ({ ...prev, positionId: next }) })
    },
    [navigate],
  )

  return (
    <Tile className="order-products__pane">
      <Stack gap={3}>
        <Text.Heading as="h3" variant="compact-01">
          Продукция
        </Text.Heading>

        {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
        {error && <Text.Helper as="p">Ошибка: {error.message}</Text.Helper>}
        {!isLoading && !error && items?.length === 0 && (
          <Text.Helper as="p">Нет позиций — запустите анализ</Text.Helper>
        )}

        {items && items.length > 0 && (
          <StructuredList
            definition={positionListDefinition}
            items={items}
            selected={selected}
            onSelected={handleSelected}
            overflow={8}
          />
        )}
      </Stack>
    </Tile>
  )
}
