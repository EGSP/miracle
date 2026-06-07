import { latestJobProgressState } from "@miracle/types"
import { CodeSnippet, Stack, Text } from "@miracle/aramid"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { useJobTreeStore } from "@/components/blocks/job-tree/JobTreeContext"
import { jobStatusToProgressBarStatus } from "@/components/blocks/job-tree/job-tree.utils"
import { Button } from "@/components/ui/ds/button"
import { ProgressBar } from "@/components/ui/ds/progress-bar"
import { jobs } from "@/lib/generated/jobs.client"

function JsonSnippet({ title, value }: { title: string; value: unknown }) {
  if (value === undefined) return null
  return (
    <Stack gap={1}>
      <Text.Label as="span">{title}</Text.Label>
      <CodeSnippet language="json" variant="md">
        {JSON.stringify(value, null, 2)}
      </CodeSnippet>
    </Stack>
  )
}

function formatDate(value: Date | string | number): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Карточка выбранного в дереве прогона. Читает узел из стора провайдера (выбор — `selectedId`). */
export function JobRunCard() {
  const run = useJobTreeStore((s) => (s.selectedId ? s.nodes[s.selectedId] : undefined))
  const rootId = useJobTreeStore((s) => s.rootId)

  const queryClient = useQueryClient()
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["jobs"] })
  }, [queryClient])

  const cancelMutation = useMutation({
    mutationFn: (id: string) => jobs.cancel(id),
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: (id: string) => jobs.remove(id),
    onSuccess: invalidate,
  })

  if (!run) {
    return <Text.Helper as="p">Выберите узел в дереве, чтобы открыть карточку прогона.</Text.Helper>
  }

  const isRunning = run.status === "running"
  const cancelTarget = run.status === "running" || run.status === "queued" ? run.id : rootId

  const latestProgress = latestJobProgressState(run.progress)

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Text.Heading as="h2" variant="compact-02">
          {run.job}
        </Text.Heading>
        <Text.Helper as="p">
          ID: {run.id} · статус: {run.status}
        </Text.Helper>
      </Stack>

      {latestProgress && (
        <ProgressBar
          label={latestProgress.label}
          helperText={
            latestProgress.determined
              ? `${Math.round(latestProgress.percentNormalized * 100)}%`
              : undefined
          }
          status={jobStatusToProgressBarStatus(run.status)}
          fill={latestProgress.percentNormalized}
          determinate={latestProgress.determined}
        />
      )}

      {run.error && <Text.Helper as="p">{run.error}</Text.Helper>}

      <Stack gap={2}>
        <Text.Helper as="p">keyHash: {run.keyHash}</Text.Helper>
        <Text.Helper as="p">Создан: {formatDate(run.createdAt)}</Text.Helper>
        <Text.Helper as="p">Обновлён: {formatDate(run.updatedAt)}</Text.Helper>
      </Stack>

      <JsonSnippet title="input" value={run.input} />
      <JsonSnippet title="output" value={run.output} />
      <JsonSnippet title="memo" value={run.memo} />

      <Stack orientation="horizontal" gap={3}>
        <Button
          variant="secondary"
          label={cancelMutation.isPending ? "Отмена…" : "Отменить прогон"}
          disabled={cancelMutation.isPending || run.status === "succeed"}
          onClick={() => cancelMutation.mutate(cancelTarget)}
        />
        <Button
          variant="danger"
          label={removeMutation.isPending ? "Удаление…" : "Удалить"}
          disabled={isRunning || removeMutation.isPending}
          onClick={() => removeMutation.mutate(run.id)}
        />
      </Stack>
    </Stack>
  )
}
