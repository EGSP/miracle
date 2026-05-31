import { Stack, Text } from "@miracle/aramid"
import { FileCard } from "@/components/blocks/FileCard"
import { FilePickerDropdown } from "@/components/blocks/file-picker/FilePickerDropdown"
import { useField } from "@/contexts/dirty-state/useField"
import { useContribute } from "@/contexts/draft-api/DraftContext"
import { useOrderCardContext } from "./OrderCard"

export function OrderCardFile() {
  const { order, files, contribute } = useOrderCardContext()

  const fileIdField = useField<string | undefined>("fileId", order.fileId ?? undefined)

  useContribute(contribute, "fileId", (o) => ({
    ...o,
    fileId: fileIdField.value ?? null,
  }))

  const selectedFile = files.find((f) => f.id === fileIdField.value) ?? null

  return (
    <Stack gap={2}>
      <Stack gap={1}>
        <Stack orientation="horizontal" gap={2} className="items-center">
          <Text.Label as="span">Файл</Text.Label>
          {fileIdField.isDirty && (
            <Text as="span" compact className="text-muted-foreground">
              (изменен)
            </Text>
          )}
        </Stack>
        <FilePickerDropdown
          files={files}
          value={fileIdField.value}
          onChange={(nextId) => fileIdField.onChange(nextId)}
        />
      </Stack>

      {selectedFile?.meta?.available === true && (
        <FileCard key={selectedFile.id} file={selectedFile} readonly />
      )}
    </Stack>
  )
}
