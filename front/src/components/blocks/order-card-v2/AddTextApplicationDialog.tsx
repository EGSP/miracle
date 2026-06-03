import { Stack } from "@miracle/aramid"
import { Dialog, type DialogButtonConfig } from "@/components/ui/modal-dialog"
import { InlineMutationNotification } from "@/components/ui/inline-mutation-notification"
import { Textarea } from "@/components/ui/textarea"
import { useAddTextApplication } from "@/lib/queries/order-application.query"
import { useState } from "react"

type Props = {
  orderId: string
  onClose: () => void
}

export function AddTextApplicationDialog({ orderId, onClose }: Props) {
  const [text, setText] = useState("")
  const addMutation = useAddTextApplication(orderId)

  const handleAdd = () => {
    const trimmed = text.trim()
    if (trimmed) addMutation.mutate(trimmed, { onSuccess: () => setText("") })
  }

  const actions: DialogButtonConfig[] = [
    { label: "Закрыть", onClick: onClose, variant: "secondary" },
    {
      label: addMutation.isPending ? "Добавление…" : "Добавить",
      onClick: handleAdd,
      disabled: !text.trim() || addMutation.isPending,
    },
  ]

  return (
    <Dialog
      title="Текстовое приложение"
      description="Текст будет прикреплён к заказу как отдельное приложение."
      size="md"
      onClose={onClose}
      actions={actions}
    >
      <Stack gap={3}>
        <Textarea
          label="Текст приложения"
          placeholder="Вставьте или введите текст…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={addMutation.isPending}
          size="lg"
          fluid
        />
        <InlineMutationNotification
          mutation={addMutation}
          successMessage="Приложение добавлено."
        />
      </Stack>
    </Dialog>
  )
}
