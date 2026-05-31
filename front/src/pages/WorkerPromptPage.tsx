import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { useSearch } from "@tanstack/react-router"
import { getApiErrorMessage } from "@/lib/api"
import { useWorkerPromptPreview } from "@/lib/queries/workers.query"

/**
 * Техническая страница для отладки: показывает собранный из input воркера промпт
 * (system + user message) ровно в том виде, в котором он уходит/уходил в LLM.
 *
 * Открывается из карточки воркера в новой вкладке по `/worker-prompt?workerId=…`.
 * Поддерживает `designation-worker` и `order-details-worker`; для остальных типов
 * бэк-эндпоинт вернёт 400 с осмысленным сообщением.
 */
export default function WorkerPromptPage() {
  const { workerId } = useSearch({ strict: false }) as { workerId?: string }

  const query = useWorkerPromptPreview(workerId)

  if (!workerId) {
    return (
      <Grid as="main" withRowGap>
        <Column span={16}>
          <Text as="p" compact className="text-destructive">
            В URL не указан workerId (ожидается ?workerId=…)
          </Text>
        </Column>
      </Grid>
    )
  }

  return (
    <Grid as="main" withRowGap>
      <Column span={16}>
        <Stack gap={2}>
          <Text.Heading as="h1" variant="02">
            Промпт воркера
          </Text.Heading>
          <Text as="p" compact className="text-muted-foreground">
            ID: {workerId}
          </Text>
        </Stack>
      </Column>

      <Column span={16}>
        {query.isLoading ? (
          <Text.Label as="p">Загрузка…</Text.Label>
        ) : query.isError ? (
          <Text as="p" compact className="text-destructive">
            {getApiErrorMessage(query.error)}
          </Text>
        ) : query.data ? (
          <Stack gap={5}>
            <Stack gap={2}>
              <Text.Heading as="h2" variant="compact-01">
                System
              </Text.Heading>
              <PromptBlock content={query.data.system} />
            </Stack>
            <Stack gap={2}>
              <Text.Heading as="h2" variant="compact-01">
                User
              </Text.Heading>
              <PromptBlock content={query.data.user} />
            </Stack>
          </Stack>
        ) : null}
      </Column>
    </Grid>
  )
}

function PromptBlock({ content }: { content: string }) {
  return (
    <div className="border border-border bg-muted/20 p-3 w-full">
      <pre className="whitespace-pre-wrap break-words text-sm font-mono">{content}</pre>
    </div>
  )
}
