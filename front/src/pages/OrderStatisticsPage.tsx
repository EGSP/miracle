import { Column, Grid, Text } from "@miracle/aramid"
import { Link, useSearch } from "@tanstack/react-router"
import { useMemo } from "react"
import { BalanceHeader } from "@/components/blocks/BalanceHeader"
import { useLlmUsageByOrder } from "@/lib/queries/llm-usage.query"
import { OrderUsageCard } from "./StatisticsPage"

/**
 * Статистика расхода токенов по одному заказу. Переиспользует ту же карточку, что и общая
 * страница статистики ({@link OrderUsageCard}), но рендерит её только для заказа из `orderId`.
 * Данные берём из общего среза `byOrder` и фильтруем по id (отдельного эндпоинта не требуется).
 */
export default function OrderStatisticsPage() {
  const { orderId } = useSearch({ from: "/statistics/order" })
  const byOrder = useLlmUsageByOrder()

  const order = useMemo(
    () => (byOrder.data ?? []).find((row) => row.orderId === orderId),
    [byOrder.data, orderId],
  )

  return (
    <Grid as="main" fullWidth withRowGap>
      <Column span={16}>
        <div className="statistics-heading-row">
          <Text.Heading as="h1" variant="02">
            Статистика заказа
          </Text.Heading>
          <BalanceHeader />
        </div>
      </Column>

      <Column span={16}>
        <Text as="p" compact>
          <Link to="/statistics">← Ко всей статистике</Link>
        </Text>
      </Column>

      {byOrder.isLoading && (
        <Column span={16}>
          <Text.Helper as="p">Загрузка…</Text.Helper>
        </Column>
      )}
      {byOrder.error && (
        <Column span={16}>
          <Text.Helper as="p">Ошибка: {byOrder.error.message}</Text.Helper>
        </Column>
      )}
      {!byOrder.isLoading && !byOrder.error && !orderId && (
        <Column span={16}>
          <Text.Helper as="p">Не передан id заказа.</Text.Helper>
        </Column>
      )}
      {!byOrder.isLoading && !byOrder.error && orderId && !order && (
        <Column span={16}>
          <Text.Helper as="p">Нет расхода токенов по этому заказу.</Text.Helper>
        </Column>
      )}
      {order && (
        <Column span={4}>
          <OrderUsageCard order={order} />
        </Column>
      )}
    </Grid>
  )
}
