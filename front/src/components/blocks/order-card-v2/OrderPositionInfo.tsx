import { Stack, Text } from "@miracle/aramid"
import type { OrderPositionConfidence, OrderPositionWithDesignation } from "@miracle/types"
import { DesignationDisplay } from "@/components/blocks/order-card/DesignationDisplay"
import { DesignationInspector } from "@/components/blocks/order-card/DesignationInspector"

const CONFIDENCE_LABEL: Record<OrderPositionConfidence, string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
}

/** Правая панель блока продукции: полная информация о выбранной позиции + условное обозначение. */
export function OrderPositionInfo({ item }: { item: OrderPositionWithDesignation }) {
  const { position, designation } = item
  const { data } = position

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Text.Heading as="h4" variant="compact-02">
          {position.name}
        </Text.Heading>
        <Text.Helper as="p">
          Тип продукции: {position.productTypeName ?? "не определён"}
        </Text.Helper>
      </Stack>

      <Stack gap={2}>
        <Text.Heading as="h4" variant="compact-01">
          Условное обозначение
        </Text.Heading>
        {designation ? (
          <>
            <DesignationDisplay designation={designation} />
            <DesignationInspector designation={designation} />
          </>
        ) : (
          <Text.Helper as="p">Обозначение не определено</Text.Helper>
        )}
      </Stack>

      <Stack gap={2}>
        <Text.Heading as="h4" variant="compact-01">
          Требования
        </Text.Heading>
        {data.requirements.length > 0 ? (
          <Stack as="ul" gap={1}>
            {data.requirements.map((line) => (
              <Text key={line} as="li" compact>
                {line}
              </Text>
            ))}
          </Stack>
        ) : (
          <Text as="p" compact>
            —
          </Text>
        )}
      </Stack>

      <Stack gap={1}>
        <Text.Helper as="p">
          Количество: {data.quantity ?? "—"}
          {data.unit ? ` ${data.unit}` : ""}
        </Text.Helper>
        {data.alternatives.length > 0 && (
          <Text.Helper as="p">Аналоги: {data.alternatives.join(", ")}</Text.Helper>
        )}
        <Text.Helper as="p">
          Уверенность выделения: {CONFIDENCE_LABEL[data.confidence]}
          {data.confidenceNote ? ` — ${data.confidenceNote}` : ""}
        </Text.Helper>
      </Stack>
    </Stack>
  )
}
