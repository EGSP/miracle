import { Column, Grid, Stack, Text } from "@miracle/aramid"
import type { JobRun, Stored } from "@miracle/types"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useCallback } from "react"
import { JobRunCard } from "@/components/blocks/job-run-card/JobRunCard"
import { JobTree } from "@/components/blocks/job-tree/JobTree"
import { JobTreeProvider } from "@/components/blocks/job-tree/JobTreeContext"
import { Tile } from "@/components/ui/ds/tile"
import { useJobRunsList } from "@/lib/queries/job-runs.query"
import { cn } from "@/lib/utils"
import "@/design/operations.css"

const COL_LIST = 4 as const
const COL_CARD = 12 as const

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function OperationsPage() {
  const { rootId, runId } = useSearch({ from: "/operations" })
  const navigate = useNavigate({ from: "/operations" })

  const { data: roots, isLoading, error } = useJobRunsList()

  const selectRoot = useCallback(
    (id: string) => {
      void navigate({ search: (prev) => ({ ...prev, rootId: id, runId: undefined }) })
    },
    [navigate],
  )

  const selectRun = useCallback(
    (run: Stored<JobRun>) => {
      void navigate({ search: (prev) => ({ ...prev, runId: run.id }) })
    },
    [navigate],
  )

  return (
    <Grid as="main" fullWidth withRowGap>
      <Column span={16}>
        <Text.Heading as="h1" variant="02">
          Операции
        </Text.Heading>
      </Column>

      <Column span={COL_LIST}>
        <Stack as="section" gap={4}>
          <Text.Heading as="h2" variant="compact-01">
            Прогоны
          </Text.Heading>

          {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
          {error && <Text.Helper as="p">Ошибка: {error.message}</Text.Helper>}
          {!isLoading && !error && (!roots || roots.length === 0) && (
            <Text.Helper as="p">Нет корневых прогонов.</Text.Helper>
          )}

          {roots && roots.length > 0 && (
            <ul className="root-list">
              {roots.map((root) => (
                <li key={root.id}>
                  <button
                    type="button"
                    className={cn("root-list__item", root.id === rootId && "root-list__item--selected")}
                    onClick={() => selectRoot(root.id)}
                  >
                    <span className="root-list__job">{root.job}</span>
                    <span className="root-list__meta">{formatDate(root.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </Column>

      <Column span={COL_CARD}>
        {rootId ? (
          <JobTreeProvider key={rootId} rootId={rootId} initialRunId={runId}>
            <Stack gap={4}>
              <Tile className="job-tree-tile">
                <JobTree rootId={rootId} onSelect={selectRun} />
              </Tile>
              <Tile as="section">
                <JobRunCard />
              </Tile>
            </Stack>
          </JobTreeProvider>
        ) : (
          <Tile>
            <Text.Helper as="p">Выберите прогон слева, чтобы открыть дерево и карточку.</Text.Helper>
          </Tile>
        )}
      </Column>
    </Grid>
  )
}
