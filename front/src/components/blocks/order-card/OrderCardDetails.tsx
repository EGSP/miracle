import { Stack, Text } from "@miracle/aramid"
import type { Designation, Dual, OrderRequirement } from "@miracle/types"
import { useMemo } from "react"
import { DesignationDisplay } from "./DesignationDisplay"
import { DesignationInspector } from "./DesignationInspector"
import { useOrderCardContext } from "./OrderCard"
import { OrderRequirementItem } from "./OrderRequirementItem"

import "@/design/order-requirements-table.css"

function OrderRequirementsTable({ requirements }: { requirements: OrderRequirement[] }) {
  return (
    <div className="order-requirements-table" role="table">
      <div className="order-requirements-table-header" role="row">
        <div className="order-requirements-table-header-cell" role="columnheader">
          Требование
        </div>
        <div className="order-requirements-table-header-cell" role="columnheader">
          Значение
        </div>
      </div>
      {requirements.map((requirement) => (
        <OrderRequirementItem key={requirement.index} requirement={requirement} />
      ))}
    </div>
  )
}

/** Блок «Условное обозначение»: компактный display + таблица проблемных слотов. */
function DesignationSection({ designation }: { designation: Designation }) {
  const hasValues = designation.values.length > 0

  return (
    <Stack gap={2}>
      <Text.Heading as="h4" variant="compact-01">
        Условное обозначение
      </Text.Heading>
      <DesignationDisplay designation={designation} />
      {!hasValues ? (
        <Text.Label as="p" className="text-muted-foreground">
          Нет значений
        </Text.Label>
      ) : (
        <DesignationInspector designation={designation} />
      )}
    </Stack>
  )
}

export function OrderCardDetails() {
  const { order } = useOrderCardContext()
  const details = useMemo(() => order?.details, [order?.id])

  const aiRequirements = useMemo(() => {
    if (!details?.requirements) {
      return []
    }
    return details.requirements
      .map((dual: Dual<OrderRequirement>) => dual.ai)
      .filter((ai): ai is OrderRequirement => ai != null && ai.used !== false)
  }, [details?.requirements])

  const designation = useMemo(() => {
    return details?.designation?.human ?? details?.designation?.ai ?? null
  }, [details?.designation])

  if (!details || order === null) {
    return null
  }

  return (
    <Stack gap={6} className="border border-border p-3">
      <Text.Heading as="h3" variant="03">
        Детали заказа
      </Text.Heading>
      {details.productTypeName ? (
        <Text.Label as="p">Тип продукции: {details.productTypeName}</Text.Label>
      ) : null}
      {designation && <DesignationSection designation={designation} />}
      <Stack gap={2}>
        <Text.Heading as="h4" variant="compact-01">
          Требования заказчика
        </Text.Heading>
        {aiRequirements.length > 0 ? (
          <OrderRequirementsTable requirements={aiRequirements} />
        ) : (
          <Text.Label as="p" className="text-muted-foreground">
            Нет требований
          </Text.Label>
        )}
      </Stack>
    </Stack>
  )
}
