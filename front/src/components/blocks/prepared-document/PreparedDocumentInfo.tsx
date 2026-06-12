import { Stack, Text } from "@miracle/aramid"
import type { PrepareStatus, PreparedDocument, Stored } from "@miracle/types"

const PREPARE_STATUS_LABEL: Record<PrepareStatus, string> = {
  queued: "В очереди",
  running: "Подготовка",
  succeed: "Готово",
  failed: "Ошибка",
}

const PREPARE_ENGINE_LABEL: Record<PreparedDocument["engine"], string> = {
  kreuzberg: "Kreuzberg",
  "llm-vision": "LLM Vision",
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type PreparedDocumentInfoProps = {
  prepared: Stored<PreparedDocument>
  fileName?: string
}

/** Краткая сводка по записи DPS для страницы и диалогов. */
export function PreparedDocumentInfo({ prepared, fileName }: PreparedDocumentInfoProps) {
  const pagesCount = prepared.pages?.length ?? 0
  const markdownLength = prepared.markdown?.length ?? 0

  return (
    <Stack gap={2}>
      {fileName && (
        <Text.Heading as="h2" variant="compact-01">
          {fileName}
        </Text.Heading>
      )}
      <Text.Helper as="p">
        Статус: {PREPARE_STATUS_LABEL[prepared.status]} · движок:{" "}
        {PREPARE_ENGINE_LABEL[prepared.engine]}
      </Text.Helper>
      <Text.Helper as="p">
        Обновлён: {formatDate(prepared.updatedAt)}
        {pagesCount > 0 ? ` · страниц: ${pagesCount}` : ""}
        {markdownLength > 0 ? ` · символов: ${markdownLength}` : ""}
      </Text.Helper>
      {prepared.jobRunId && <Text.Helper as="p">Прогон: {prepared.jobRunId}</Text.Helper>}
      {prepared.error && <Text.Helper as="p">Ошибка: {prepared.error}</Text.Helper>}
    </Stack>
  )
}
