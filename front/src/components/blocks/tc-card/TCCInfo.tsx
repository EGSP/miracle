import { Stack, Text } from "@miracle/aramid"
import type { ProductType, Stored, TechnicalCondition } from "@miracle/types"
import { useMemo } from "react"
import { Input } from "@/components/ui/ds/input"
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { useProductTypes } from "@/lib/queries/product-type.query"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

export function TCCInfo() {
  const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext()
  const tc = technicalCondition

  const { data: productTypes = [], isLoading: isProductTypesLoading } = useProductTypes()

  const name = useField<string>(`tc-${tc.id}-name`, tc.name ?? "")
  const productTypeId = useField<string | undefined>(`tc-${tc.id}-productTypeId`, tc.productTypeId)

  const selectedProductType = useMemo(
    () => productTypes.find((pt) => pt.id === productTypeId.value) ?? null,
    [productTypes, productTypeId.value],
  )

  useContribute(
    contribute,
    `tc-${tc.id}-meta`,
    (draft): Stored<TechnicalCondition> => ({
      ...draft,
      name: name.value.trim() || undefined,
      productTypeId: productTypeId.value,
    }),
  )

  const productTypeLabel =
    selectedProductType?.name ??
    tc.lastProductTypeName ??
    (tc.productTypeId ? tc.productTypeId : null)

  return (
    <Stack gap={3}>
      <Text.Heading as="p" variant="02">
        Основные поля
      </Text.Heading>

      <Stack gap={3} orientation="horizontal">
        <Input
          placeholder="Напр. ГОСТ Р 52931-2008"
          value={name.value}
          onChange={name.onInputChange}
          disabled={isSaving}
          label="Название"
        />
        <Input.Dropdown<Stored<ProductType>>
          label="Тип продукции"
          helperText={`Последний выбранный тип: ${productTypeLabel}`}
          items={productTypes}
          value={selectedProductType}
          onChange={(next) => productTypeId.onChange(next?.id)}
          getItemKey={(item) => item.id}
          disabled={isSaving || isProductTypesLoading}
          renderSelectedItem={(item) => (
            <Text as="span" compact>
              {item?.name ?? "Тип не выбран"}
            </Text>
          )}
          renderListItem={(item) => (
            <Text as="span" compact>
              {item?.name ?? "Тип не выбран"}
            </Text>
          )}
        >
          <Input.Dropdown.Selected />
          <Input.Dropdown.List emptyText="Нет типов продукции" />
        </Input.Dropdown>
      </Stack>
    </Stack>
  )
}
