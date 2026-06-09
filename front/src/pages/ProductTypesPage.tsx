import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { useMemo } from "react"
import { CreateProductTypeDialog } from "@/components/blocks/product-type-card/CreateProductTypeDialog"
import { ProductTypeCard } from "@/components/blocks/product-type-card/ProductTypeCard"
import { DirtyGuardProvider } from "@/contexts/dirty-state/DirtyGuardContext"
import { useProductTypes } from "@/lib/queries/product-type.query"

export default function ProductTypesPage() {
  const { data: productTypes, isLoading, error } = useProductTypes()

  const sortedProductTypes = useMemo(() => {
    if (!productTypes) return undefined
    return [...productTypes].sort((a, b) => a.name.localeCompare(b.name, "ru"))
  }, [productTypes])

  return (
    <DirtyGuardProvider>
      <Grid as="main" withRowGap fullWidth>
        <Column span={16}>
          <Stack gap={3}>
            <Text.Heading as="h1" variant="02">
              Типы продукции
            </Text.Heading>
            <CreateProductTypeDialog />
          </Stack>
        </Column>

        {isLoading && <Text.Label as="p">Загрузка...</Text.Label>}
        {error && (
          <Text as="p" compact>
            Ошибка: {error.message}
          </Text>
        )}
        {!isLoading && !error && sortedProductTypes?.length === 0 && (
          <Text.Label as="p">Типы продукции ещё не созданы</Text.Label>
        )}
        {sortedProductTypes &&
          sortedProductTypes.length > 0 &&
          sortedProductTypes.map((item) => (
            <Column span="25%">
              <ProductTypeCard key={item.id} productType={item} />
            </Column>
          ))}
      </Grid>
    </DirtyGuardProvider>
  )
}
