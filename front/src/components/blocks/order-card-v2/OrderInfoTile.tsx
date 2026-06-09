import { Stack, Text } from "@miracle/aramid"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { Input } from "@/components/ui/ds/input"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrder, useGetOrderJob, useUpdateOrder } from "@/lib/queries/order.query"
import { OrderAnalyseProgress } from "./OrderAnalyseProgress"

function OrderOperationLink({ orderId }: { orderId: string }) {
  const { data: run } = useGetOrderJob(orderId)
  if (!run) return null

  const href = `/operations?rootId=${encodeURIComponent(run.id)}`

  return (
    <Text.Helper as="p">
      <a href={href} target="_blank" rel="noopener noreferrer">
        Операция анализа
      </a>
    </Text.Helper>
  )
}

function normalizeNameInput(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function OrderInfoTile({ orderId }: { orderId: string }) {
  const { data: order } = useGetOrder(orderId)
  const updateMutation = useUpdateOrder(orderId)
  const [name, setName] = useState("")

  useEffect(() => {
    if (order) setName(order.name ?? "")
  }, [order?.id, order?.name])

  const savedName = order?.name ?? ""
  const isDirty = name !== savedName
  const canSave = isDirty && !updateMutation.isPending

  const handleSave = () => {
    updateMutation.mutate({ name: normalizeNameInput(name) })
  }

  return (
    <Tile>
      <Stack gap={2}>
        <Text.Heading as="h3" variant="compact-01">
          Информация
        </Text.Heading>

        <Stack gap={2}>
          <Button
            variant="primary"
            size="sm"
            label={updateMutation.isPending ? "Сохранение…" : "Сохранить"}
            disabled={!canSave}
            onClick={handleSave}
          />
          <Input
            label="Название"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={order?.id}
          />
        </Stack>
        <OrderAnalyseProgress orderId={orderId} />
        <OrderOperationLink orderId={orderId} />
      </Stack>
    </Tile>
  )
}
