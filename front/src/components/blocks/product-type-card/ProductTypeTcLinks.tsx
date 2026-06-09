import { IconIndicator, Stack, Text } from "@miracle/aramid"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/ds/button"
import { Dialog } from "@/components/ui/ds/modal-dialog"
import { useDialog } from "@/lib/hooks/use-dialog"
import {
  linkedTechnicalConditionLabel,
  useLinkedTechnicalConditions,
} from "@/lib/queries/product-type.query"

type ProductTypeTcLinksProps = {
  productTypeId: string
}

function TcLink({
  tcId,
  label,
  expressive = false,
}: {
  tcId: string
  label: string
  expressive?: boolean
}) {
  return (
    <Text.Helper as="span">
      <Link
        to="/technical-conditions"
        search={{ tcId }}
        target="_blank"
        rel="noopener noreferrer"
      >
        {expressive ? (
          <Text.Label as="span" expressive>
            {label}
          </Text.Label>
        ) : (
          label
        )}
      </Link>
    </Text.Helper>
  )
}

function MultipleTcLinksDialog({
  onClose,
  items,
}: {
  onClose: () => void
  items: Array<{ id: string; name: string | null }>
}) {
  return (
    <Dialog
      title="Технические условия"
      description="К этому типу продукции привязано несколько ТУ. Каждая ссылка откроет карточку соответствующего технического условия в новой вкладке."
      size="sm"
      onClose={onClose}
    >
      <Stack gap={2}>
        {items.map((tc) => (
          <TcLink
            key={tc.id}
            tcId={tc.id}
            label={linkedTechnicalConditionLabel(tc)}
            expressive
          />
        ))}
      </Stack>
    </Dialog>
  )
}

export function ProductTypeTcLinks({ productTypeId }: ProductTypeTcLinksProps) {
  const { data: linkedTcs, isLoading } = useLinkedTechnicalConditions(productTypeId)
  const { open } = useDialog()

  if (isLoading) {
    return (
      <Text.Helper as="p">
        Проверка ТУ…
      </Text.Helper>
    )
  }

  const count = linkedTcs?.length ?? 0

  if (count === 0) {
    return (
      <IconIndicator
        kind="caution-major"
        label="Для типа продукции не задано техническое условие"
        size={16}
      />
    )
  }

  if (count === 1) {
    const tc = linkedTcs![0]
    return (
      <Stack orientation="horizontal" gap={2}>
        <Text.Helper as="span">ТУ:</Text.Helper>
        <TcLink tcId={tc.id} label={linkedTechnicalConditionLabel(tc)} />
      </Stack>
    )
  }

  const openLinksDialog = () => {
    open(({ close }) => (
      <MultipleTcLinksDialog onClose={close} items={linkedTcs!} />
    ))
  }

  return (
    <Stack orientation="horizontal" gap={2}>
      <IconIndicator kind="failed" label={`Несколько ТУ (${count})`} size={16} />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        label="Открыть список ТУ"
        onClick={openLinksDialog}
      />
    </Stack>
  )
}
