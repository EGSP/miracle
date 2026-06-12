import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { useSearch } from "@tanstack/react-router"
import { PreparedDocumentInfo } from "@/components/blocks/prepared-document/PreparedDocumentInfo"
import { Tile } from "@/components/ui/ds/tile"
import { Markdown } from "@/components/ui/external/markdown"
import { useGetPreparedDocument } from "@/lib/queries/document-prepare.query"
import { useGetFiles } from "@/lib/queries/file.query"

export default function PreparedDocumentPage() {
  const { fileId } = useSearch({ from: "/prepared-document" })
  const {
    data: prepared,
    isPending,
    isError,
    error,
  } = useGetPreparedDocument(fileId)
  const { data: files = [] } = useGetFiles({ id: fileId })
  const fileName = files[0]?.name

  return (
    <Grid as="main" withRowGap fullWidth>
      <Column span="100%">
        <Text.Heading as="h1" variant="02">
          Подготовленный документ
        </Text.Heading>
      </Column>
      <Column span="100%">
        {!fileId && <Text.Helper as="p">Не указан идентификатор файла.</Text.Helper>}
        {fileId && isPending && <Text.Helper as="p">Загрузка…</Text.Helper>}
        {fileId && isError && (
          <Text.Helper as="p">Ошибка: {error?.message ?? "не удалось загрузить документ"}</Text.Helper>
        )}
        {fileId && !isPending && !isError && !prepared && (
          <Text.Helper as="p">Подготовленный документ для этого файла ещё не создан.</Text.Helper>
        )}
        {fileId && prepared && (
          <Tile as="section">
            <Stack gap={4}>
              <PreparedDocumentInfo prepared={prepared} fileName={fileName} />
              <Stack gap={1}>
                <Text.Label as="span">Markdown</Text.Label>
                {prepared.markdown ? (
                  <div className="markdown-host">
                    <Markdown>{prepared.markdown}</Markdown>
                  </div>
                ) : (
                  <Text.Helper as="p">Текст markdown пока пуст.</Text.Helper>
                )}
              </Stack>
            </Stack>
          </Tile>
        )}
      </Column>
    </Grid>
  )
}
