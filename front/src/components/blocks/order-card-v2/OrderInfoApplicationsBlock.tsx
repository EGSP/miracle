import { Column, Grid } from "@miracle/aramid"
import { ApplicationsTile } from "./applications/ApplicationsTile"
import { OrderInfoTile } from "./OrderInfoTile"

/** Верхняя строка карточки заказа: информация и приложения (50/50). */
export function OrderInfoApplicationsBlock({ orderId }: { orderId: string }) {
  return (
    <Grid fullWidth narrow>
      <Column span="50%">
        <OrderInfoTile orderId={orderId} />
      </Column>
      <Column span="50%">
        <ApplicationsTile orderId={orderId} />
      </Column>
    </Grid>
  )
}
