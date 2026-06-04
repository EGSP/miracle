import { Text } from "@miracle/aramid"
import { useSearch } from "@tanstack/react-router"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrderPositions } from "@/lib/queries/order.query"
import { OrderPositionInfo } from "./OrderPositionInfo"
import "./order-products.css"

/** Правый тайл блока продукции: полная информация о выбранной (через navigation) позиции. */
export function OrderPositionInfoTile({ orderId }: { orderId: string }) {
  const { positionId } = useSearch({ from: "/orders" })
  const { data: items } = useGetOrderPositions(orderId)

  const selected = items?.find((it) => it.position.id === positionId) ?? null

  return (
    <Tile className="order-products__pane">
      {selected ? (
        <OrderPositionInfo item={selected} />
      ) : (
        <Text.Helper as="p">
          Выберите позицию слева, чтобы увидеть информацию о продукции.
        </Text.Helper>
      )}
    </Tile>
  )
}
