import { Stack, Text } from "@miracle/aramid"
import type { ProductType, Stored } from "@miracle/types"
import { Plus } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/ds/button"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { Input } from "@/components/ui/ds/input"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { DirtyGuardProvider, useGuardActions } from "@/contexts/dirty-state/DirtyGuardContext"
import { useField } from "@/contexts/dirty-state/useField"
import { useDialog } from "@/lib/hooks/use-dialog"
import { useProductTypes } from "@/lib/queries/product-type.query"
import { useCreateTechnicalCondition } from "@/lib/queries/technical-condition.query"

function CreateTechnicalConditionDialogContent({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateTechnicalCondition()
  const { commitAll, resetAll } = useGuardActions()
  const { data: productTypes = [], isLoading: isProductTypesLoading } = useProductTypes()

  const productTypeId = useField<string | undefined>("new-tc-product-type-id", undefined)

  const selectedProductType = useMemo(
    () => productTypes.find((pt) => pt.id === productTypeId.value) ?? null,
    [productTypes, productTypeId.value],
  )

  const handleCreate = () => {
    createMutation.mutate(
      {
        productTypeId: productTypeId.value,
        slotRules: [],
        displayTemplates: [],
      },
      {
        onSuccess: () => {
          commitAll()
          onClose()
        },
      },
    )
  }

  const handleCancel = () => {
    resetAll()
    onClose()
  }

  const actions: DialogButtonConfig[] = [
    {
      label: "Отмена",
      onClick: handleCancel,
      variant: "secondary",
      disabled: createMutation.isPending,
    },
    {
      label: createMutation.isPending ? "Создание..." : "Создать ТУ",
      onClick: handleCreate,
      disabled: createMutation.isPending,
    },
  ]

  return (
    <Dialog title="Новое техническое условие" size="md" onClose={onClose} actions={actions}>
      <Stack gap={3}>
        <Text.Helper as="p">
          Тип продукции можно задать сейчас или позже в карточке ТУ.
        </Text.Helper>
        <Stack gap={1}>
          <Text.Label as="span">Тип продукции</Text.Label>
          <Input.Dropdown<Stored<ProductType>>
            items={productTypes}
            value={selectedProductType}
            onChange={(next) => productTypeId.onChange(next?.id)}
            getItemKey={(item) => item.id}
            disabled={isProductTypesLoading || createMutation.isPending}
            renderSelectedItem={(item) => (
              <Text as="span" compact>
                {item?.name ?? "Тип не выбран"}
              </Text>
            )}
            renderListItem={(item) => (
              <Text as="span" compact>
                {item?.name ?? ""}
              </Text>
            )}
          >
            <Input.Dropdown.Selected />
            <Input.Dropdown.List emptyText="Нет типов продукции" />
          </Input.Dropdown>
        </Stack>
        <InlineMutationNotification mutation={createMutation} />
      </Stack>
    </Dialog>
  )
}

export function CreateTechnicalConditionDialog() {
  const { open } = useDialog()

  return (
    <Button
      type="button"
      size="sm"
      icon={<Plus />}
      label="Создать ТУ"
      onClick={() =>
        open(({ close }) => (
          <DirtyGuardProvider id="create-technical-condition">
            <CreateTechnicalConditionDialogContent onClose={close} />
          </DirtyGuardProvider>
        ))
      }
    />
  )
}
