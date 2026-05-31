import { Stack, Text } from "@miracle/aramid"

type SynonymsPreviewProps = {
  synonyms: string[]
  emptyLabel?: string
}

export function SynonymsPreview({
  synonyms,
  emptyLabel = "Синонимы не заданы",
}: SynonymsPreviewProps) {
  if (synonyms.length === 0) {
    if (!emptyLabel) {
      return null
    }
    return <Text.Helper as="p">{emptyLabel}</Text.Helper>
  }

  return (
    <Stack as="ul" gap={1} className="m-0 list-disc list-inside p-0">
      {synonyms.map((synonym) => (
        <li key={synonym} className="leading-tight">
          <Text.Helper as="span">{synonym}</Text.Helper>
        </li>
      ))}
    </Stack>
  )
}
