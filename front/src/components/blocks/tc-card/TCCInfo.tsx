import { Column, Grid, Stack, Text } from "@miracle/aramid"
import type { ProductType, Stored, TechnicalCondition } from "@miracle/types"
import { useMemo } from "react"
import { FilePickerDropdown } from "@/components/blocks/file-picker/FilePickerDropdown"
import { Input } from "@/components/ui/ds/input"
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { useGetFiles } from "@/lib/queries/file.query"
import { useProductTypes } from "@/lib/queries/product-type.query"
import { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

export function TCCInfo() {
  const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext()
  const tc = technicalCondition

  const { data: tcFiles = [] } = useGetFiles({ isTechnicalCondition: true, includeMeta: true })
  const { data: productTypes = [], isLoading: isProductTypesLoading } = useProductTypes()

  const name = useField<string>(`tc-${tc.id}-name`, tc.name ?? "")
  const fileId = useField<string | undefined>(`tc-${tc.id}-fileId`, tc.fileId)
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
      fileId: fileId.value,
      productTypeId: productTypeId.value,
    }),
  )

  const productTypeLabel =
    selectedProductType?.name ??
    tc.lastProductTypeName ??
    (tc.productTypeId ? tc.productTypeId : null)

  return (
    <Grid withRowGap fullWidth narrow>
      <Column span="100%">
        <Text.Heading as="p" variant="02">
          Основные поля
        </Text.Heading>
      </Column>

      <Column span="100%">
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

        <Text.Label as="span">Файл ТУ</Text.Label>
        {/* TODO: загрузка нового файла ТУ — через страницу файлов (FileUploadDialog удалён) */}
        <FilePickerDropdown
          files={tcFiles}
          value={fileId.value}
          onChange={(id) => fileId.onChange(id)}
        />
      </Column>
      <Column span="100%"></Column>
    </Grid>
  )
}
