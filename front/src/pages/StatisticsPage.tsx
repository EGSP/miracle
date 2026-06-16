import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { type LlmUsageByOrder, type LlmUsageRecord, orderDisplayName } from "@miracle/types"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Tile } from "@/components/ui/ds/tile"
import { useLlmUsageByOrder, useLlmUsageRecent } from "@/lib/queries/llm-usage.query"
import "@/design/statistics.css"

/** Точка графика total — один завершённый LLM-запрос. `null`-usage трактуем как 0. */
type UsageDatum = {
  idx: number
  responseId: string
  model: string
  transport: string
  completedAt: string | null
  total: number
  input: number
  output: number
  estimated: number
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function toDatum(record: LlmUsageRecord, index: number): UsageDatum {
  return {
    idx: index + 1,
    responseId: record.responseId,
    model: record.model,
    transport: record.transport,
    completedAt: record.completedAt,
    total: record.totalTokens ?? 0,
    input: record.inputTokens ?? 0,
    output: record.outputTokens ?? 0,
    estimated: record.estimatedInputTokens ?? 0,
  }
}

/** Тултип графика total: бары безымянные из-за плотности — детали по наведению. */
function UsageTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: UsageDatum }>
}) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null
  return (
    <div className="usage-tooltip">
      <div className="usage-tooltip__title">
        {datum.completedAt ? formatDate(datum.completedAt) : datum.responseId}
      </div>
      <div className="usage-tooltip__muted">
        {datum.model} · {datum.transport}
      </div>
      <div>total: {datum.total.toLocaleString("ru-RU")}</div>
      <div>
        вход: {datum.input.toLocaleString("ru-RU")} · выход: {datum.output.toLocaleString("ru-RU")}
      </div>
      <div className="usage-tooltip__muted">
        оценка входа: {datum.estimated.toLocaleString("ru-RU")}
      </div>
    </div>
  )
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const
const TOTAL_HEIGHT = 280
const PIE_HEIGHT = 160

/** Карточка заказа: имя-ссылка + donut-pie суммарного usage (вход/выход) за всё время. */
function OrderUsageCard({ order }: { order: LlmUsageByOrder }) {
  const name = orderDisplayName({ id: order.orderId, name: order.orderName })
  const slices = [
    { key: "input", label: "вход", value: order.inputTokens, color: "var(--chart-2)" },
    { key: "output", label: "выход", value: order.outputTokens, color: "var(--chart-3)" },
  ]

  return (
    <Tile as="article">
      <Stack gap={2}>
        <Link
          to="/orders"
          search={{ orderId: order.orderId, positionId: undefined }}
          className="usage-order-card__title"
        >
          {name}
        </Link>

        <ResponsiveContainer width="100%" height={PIE_HEIGHT}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={38}
              outerRadius={62}
              stroke="var(--card)"
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="usage-tooltip">
                    {payload[0].name}: {Number(payload[0].value).toLocaleString("ru-RU")}
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <Text.Helper as="p">
          Всего: {order.totalTokens.toLocaleString("ru-RU")} · вход{" "}
          {order.inputTokens.toLocaleString("ru-RU")} · выход{" "}
          {order.outputTokens.toLocaleString("ru-RU")} · запросов {order.requests}
        </Text.Helper>
      </Stack>
    </Tile>
  )
}

export default function StatisticsPage() {
  const recent = useLlmUsageRecent()
  const byOrder = useLlmUsageByOrder()

  const chart = useMemo<UsageDatum[]>(() => (recent.data ?? []).map(toDatum), [recent.data])
  const orders = byOrder.data ?? []

  return (
    <Grid as="main" fullWidth withRowGap>
      <Column span={16}>
        <Text.Heading as="h1" variant="02">
          Статистика расхода токенов
        </Text.Heading>
      </Column>

      {/* ── График total по последним завершённым запросам (старые слева, новые справа) ── */}
      <Column span={16}>
        <Tile as="section">
          <Stack gap={2}>
            <Text.Heading as="h2" variant="compact-01">
              Всего токенов (total)
            </Text.Heading>

            {recent.isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
            {recent.error && <Text.Helper as="p">Ошибка: {recent.error.message}</Text.Helper>}
            {!recent.isLoading && !recent.error && chart.length === 0 && (
              <Text.Helper as="p">Нет завершённых запросов.</Text.Helper>
            )}
            {chart.length > 0 && (
              <ResponsiveContainer width="100%" height={TOTAL_HEIGHT}>
                <BarChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="idx" tick={false} axisLine={{ stroke: "var(--border)" }} height={8} />
                  <YAxis tick={AXIS_TICK} axisLine={{ stroke: "var(--border)" }} width={56} />
                  <Tooltip content={<UsageTooltip />} cursor={{ fill: "var(--muted-foreground)", opacity: 0.08 }} />
                  <Bar dataKey="total" fill="var(--chart-1)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Stack>
        </Tile>
      </Column>

      {/* ── Карточки по заказам: суммарный usage за всё время (pie вход/выход) ── */}
      <Column span={16}>
        <Text.Heading as="h2" variant="compact-01">
          По заказам
        </Text.Heading>
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
      {!byOrder.isLoading && !byOrder.error && orders.length === 0 && (
        <Column span={16}>
          <Text.Helper as="p">Нет заказов с расходом токенов.</Text.Helper>
        </Column>
      )}
      {orders.map((order) => (
        <Column key={order.orderId} span={4}>
          <OrderUsageCard order={order} />
        </Column>
      ))}
    </Grid>
  )
}
