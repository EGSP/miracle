import { Stack, Text } from "@miracle/aramid"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { Input } from "@/components/ui/ds/input"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrder, useUpdateOrder } from "@/lib/queries/order.query"
import { OrderAnalyseProgress } from "./OrderAnalyseProgress"

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
      <Stack gap={4}>
        <Text.Heading as="h3" variant="compact-01">
          Информация
        </Text.Heading>

        <Input
          label="Название"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={order?.id}
          fluid
        />

        <Button
          variant="primary"
          label={updateMutation.isPending ? "Сохранение…" : "Сохранить"}
          disabled={!canSave}
          onClick={handleSave}
        />

        <OrderAnalyseProgress orderId={orderId} />
      </Stack>
    </Tile>
  )
}
