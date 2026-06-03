import { Stack, Text } from "@miracle/aramid"
import { Plus } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/ds/button"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { Input } from "@/components/ui/ds/input"
import { Textarea } from "@/components/ui/ds/textarea"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import {
  DirtyGuardProvider,
  useGuardActions,
  useGuardState,
} from "@/contexts/dirty-state/DirtyGuardContext"
import { useField } from "@/contexts/dirty-state/useField"
import { useDialog } from "@/lib/hooks/use-dialog"
import { parseSynonymsFromText } from "@/lib/product-type-synonyms"
import { useCreateProductType } from "@/lib/queries/product-type.query"
import { SynonymsPreview } from "./SynonymsPreview"

function CreateProductTypeDialogContent({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateProductType()
  const { isDirtyAnywhere } = useGuardState()
  const { commitAll, resetAll } = useGuardActions()

  const name = useField("name", "")
  const synonymsText = useField("synonymsText", "")

  const parsedSynonyms = useMemo(
    () => parseSynonymsFromText(synonymsText.value),
    [synonymsText.value],
  )

  const handleCreate = () => {
    const trimmedName = name.value.trim()
    if (!trimmedName) {
      return
    }

    createMutation.mutate(
      { name: trimmedName, synonyms: parsedSynonyms },
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
      label: createMutation.isPending ? "Создание..." : "Создать",
      onClick: handleCreate,
      disabled: !isDirtyAnywhere || !name.value.trim() || createMutation.isPending,
    },
  ]

  return (
    <Dialog title="Новый тип продукции" size="md" onClose={onClose} actions={actions}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Text.Label as="span">Название</Text.Label>
          <Input
            id="new-product-type-name"
            aria-label="Название нового типа продукции"
            value={name.value}
            onChange={name.onInputChange}
            disabled={createMutation.isPending}
          />
        </Stack>
        <Stack gap={1}>
          <Text.Label as="span">Синонимы</Text.Label>
          <Text.Helper as="p">По одному синониму на строку</Text.Helper>
          <div className="flex items-start gap-2">
            <div className="basis-[70%]">
              <Textarea
                size="md"
                value={synonymsText.value}
                onChange={synonymsText.onInputChange}
                disabled={createMutation.isPending}
                placeholder="муфта"
                aria-label="Синонимы нового типа"
              />
            </div>
            <div className="basis-[30%]">
              <div className="min-w-0 border border-input/50 bg-muted/20 p-2">
                <SynonymsPreview synonyms={parsedSynonyms} emptyLabel="" />
              </div>
            </div>
          </div>
        </Stack>
        <InlineMutationNotification mutation={createMutation} />
      </Stack>
    </Dialog>
  )
}

export function CreateProductTypeDialog() {
  const { open } = useDialog()

  return (
    <Button
      size="sm"
      icon={<Plus />}
      label="Создать тип"
      onClick={() =>
        open(({ close }) => (
          <DirtyGuardProvider id="create-product-type">
            <CreateProductTypeDialogContent onClose={close} />
          </DirtyGuardProvider>
        ))
      }
    />
  )
}
