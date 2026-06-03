import { Stack, Text } from "@miracle/aramid"
import type { Order, Stored, TechnicalCondition } from "@miracle/types"
import { useMemo, useState } from "react"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { Input } from "@/components/ui/ds/input"
import { Dialog } from "@/components/ui/ds/modal-dialog"
import { useAnalyseDesignation, useGetOrders } from "@/lib/queries/order.query"
import { useTechnicalConditions } from "@/lib/queries/technical-condition.query"

export function AnalyseDesignationModal({
  defaultOrderId,
  onClose,
}: {
  defaultOrderId: string
  onClose: () => void
}) {
  const [orderId, setOrderId] = useState<string | undefined>(defaultOrderId)
  const [tcId, setTcId] = useState<string | undefined>(undefined)

  const ordersQuery = useGetOrders({})
  const orders = ordersQuery.data ?? []

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === orderId) ?? null,
    [orders, orderId],
  )

  const tcsQuery = useTechnicalConditions()
  const tcs = tcsQuery.data ?? []

  const selectedTc = useMemo(() => tcs.find((t) => t.id === tcId) ?? null, [tcs, tcId])

  const analyseMutation = useAnalyseDesignation()

  const canSubmit =
    !!orderId &&
    !!tcId &&
    !analyseMutation.isPending &&
    !ordersQuery.isLoading &&
    !tcsQuery.isLoading

  const handleSubmit = () => {
    if (!orderId || !tcId) {
      return
    }
    analyseMutation.mutate(
      { orderId, tcId },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  return (
    <Dialog
      description="Условное обозначение"
      title="Анализ заказа"
      size="md"
      onClose={onClose}
      actions={[
        {
          label: "Отмена",
          onClick: onClose,
          variant: "secondary",
          disabled: analyseMutation.isPending,
        },
        {
          label: analyseMutation.isPending ? "Запуск…" : "Анализировать",
          onClick: handleSubmit,
          disabled: !canSubmit,
        },
      ]}
    >
      <Stack gap={5}>
        <Text.Helper as="p">
          Выберите заказ и техническое условие — будет запущен анализ условного обозначения.
        </Text.Helper>

        <Stack gap={1}>
          <Input.Dropdown<Stored<Order>>
            label="Заказ"
            items={orders}
            value={selectedOrder}
            onChange={(next) => {
              setOrderId(next?.id)
              setTcId(undefined)
            }}
            getItemKey={(item) => item.id}
            disabled={ordersQuery.isLoading || analyseMutation.isPending}
            renderSelectedItem={(item) => (
              <Text as="span" compact>
                {item ? `Заказ ${item.id.slice(0, 8)}…` : "Заказ не выбран"}
              </Text>
            )}
            renderListItem={(item) => (
              <Text as="span" compact>
                {item ? `Заказ ${item.id.slice(0, 8)}…` : ""}
              </Text>
            )}
            fluid
          >
            <Input.Dropdown.Selected />
            <Input.Dropdown.List emptyText="Нет заказов" />
          </Input.Dropdown>
        </Stack>

        <Stack gap={1}>
          <Input.Dropdown<Stored<TechnicalCondition>>
            label="Техническое условие"
            items={tcs}
            value={selectedTc}
            onChange={(next) => setTcId(next?.id)}
            getItemKey={(item) => item.id}
            disabled={tcsQuery.isLoading || analyseMutation.isPending}
            renderSelectedItem={(item) => (
              <Text as="span" compact>
                {getTcLabel(item)}
              </Text>
            )}
            renderListItem={(item) => (
              <Text as="span" compact>
                {getTcLabel(item)}
              </Text>
            )}
            fluid
          >
            <Input.Dropdown.Selected />
            <Input.Dropdown.List emptyText="Нет доступных ТУ" />
          </Input.Dropdown>
        </Stack>

        <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
      </Stack>
    </Dialog>
  )
}

function getTcLabel(tc: Stored<TechnicalCondition> | null) {
  if (!tc) return "ТУ не выбрано"
  if (!tc.name && !tc.lastProductTypeName) return "У ТУ нет названия"
  return (tc?.name + " " + tc?.lastProductTypeName).trim()
}
