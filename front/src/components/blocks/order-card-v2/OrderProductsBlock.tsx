import { Column, Grid } from "@miracle/aramid"
import { OrderPositionInfoTile } from "./OrderPositionInfoTile"
import { OrderProductsTile } from "./OrderProductsTile"

/**
 * Блок продукции карточки заказа: две колонки (16-колоночный грид) — слева тайл со списком
 * позиций, справа тайл с полной информацией о выбранной позиции. Выбор — через navigation
 * (`positionId` маршрута /orders), общий кэш позиций между тайлами.
 */
export function OrderProductsBlock({ orderId }: { orderId: string }) {
  return (
    <Grid fullWidth narrow>
      <Column span={8}>
        <OrderProductsTile orderId={orderId} />
      </Column>
      <Column span={8}>
        <OrderPositionInfoTile orderId={orderId} />
      </Column>
    </Grid>
  )
}
