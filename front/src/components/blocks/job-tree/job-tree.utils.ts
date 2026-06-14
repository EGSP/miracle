import type { IconIndicatorKind } from "@miracle/aramid"
import { latestJobProgressState, type JobRun, type JobStatus, type Stored } from "@miracle/types"
import type { ProgressBarStatus } from "@/components/ui/ds/progress-bar"

export const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  "succeed",
  "partial",
  "failed",
  "cancelled",
])

export const ACTIVE_JOB_STATUSES = new Set<JobStatus>(["queued", "running"])

export function isJobStatusActive(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.has(status)
}

export function isJobStatusTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status)
}

const indicatorByProgressStatus: Record<ProgressBarStatus, IconIndicatorKind> = {
  running: "in-progress",
  partial: "caution-minor",
  succeed: "succeeded",
  failed: "failed",
}

const statusLabels: Record<JobStatus, string> = {
  queued: "В очереди",
  running: "Выполняется",
  partial: "Частично",
  succeed: "Успех",
  failed: "Ошибка",
  cancelled: "Отменено",
}

/** Статус прогона → иконка {@link IconIndicator}. */
export function jobStatusToIconIndicator(status: JobStatus): {
  kind: IconIndicatorKind
  label: string
} {
  return {
    kind: indicatorByProgressStatus[jobStatusToProgressBarStatus(status)],
    label: statusLabels[status],
  }
}

export function getJobStatusLabel(status: JobStatus): string {
  return statusLabels[status]
}

function fallbackFillForTerminalStatus(status: JobStatus): number {
  switch (status) {
    case "succeed":
    case "failed":
    case "cancelled":
      return 1
    case "partial":
      return 0.5
    default:
      return 0
  }
}

export type JobNodeProgressView = {
  label: string
  fill: number
  determinate: boolean
}

/** Прогресс для узла дерева: из history или fallback по терминальному статусу. */
export function resolveJobNodeProgress(node: Stored<JobRun>): JobNodeProgressView | undefined {
  const latest = latestJobProgressState(node.progress)
  if (latest) {
    return {
      label: latest.label,
      fill: latest.percentNormalized,
      determinate: latest.determined,
    }
  }

  if (!isJobStatusTerminal(node.status)) {
    return undefined
  }

  return {
    label: statusLabels[node.status],
    fill: fallbackFillForTerminalStatus(node.status),
    determinate: true,
  }
}

/** Статус прогона → статус трека {@link InlineProgressBar}. */
export function jobStatusToProgressBarStatus(status: JobStatus): ProgressBarStatus {
  switch (status) {
    case "partial":
      return "partial"
    case "succeed":
      return "succeed"
    case "failed":
    case "cancelled":
      return "failed"
    default:
      return "running"
  }
}

export type JobTreeIndexes = {
  nodes: Record<string, Stored<JobRun>>
  childrenByParent: Record<string, string[]>
}

/**
 * Компаратор дочерних узлов по дате создания (по возрастанию): старые сверху, новые снизу.
 * Принимает карту узлов, т.к. сортируются их id. Отсутствующий узел → в начало (defensive).
 */
export function compareChildrenByCreatedAt(
  nodes: Record<string, Stored<JobRun>>,
): (a: string, b: string) => number {
  const at = (id: string): number => (nodes[id] ? new Date(nodes[id].createdAt).getTime() : 0)
  return (a, b) => at(a) - at(b)
}

export function buildIndexes(flat: Stored<JobRun>[], rootId: string): JobTreeIndexes {
  const nodes: Record<string, Stored<JobRun>> = {}
  const childrenByParent: Record<string, string[]> = {}

  for (const run of flat) {
    nodes[run.id] = run
    const parentKey = run.parentId ?? rootId
    if (!childrenByParent[parentKey]) childrenByParent[parentKey] = []
    if (run.id !== rootId) {
      childrenByParent[parentKey].push(run.id)
    }
  }

  const compare = compareChildrenByCreatedAt(nodes)
  for (const key of Object.keys(childrenByParent)) {
    childrenByParent[key].sort(compare)
  }

  return { nodes, childrenByParent }
}

const PATCH_KEYS = ["status", "progress", "error", "output", "memo", "updatedAt"] as const

function runChanged(prev: Stored<JobRun>, next: Stored<JobRun>): boolean {
  for (const key of PATCH_KEYS) {
    if (prev[key] !== next[key]) return true
  }
  return false
}

export type TreeDiff = {
  patches: Array<{ id: string; patch: Partial<Stored<JobRun>> }>
  added: Stored<JobRun>[]
}

export function diffTree(
  prevNodes: Record<string, Stored<JobRun>>,
  flat: Stored<JobRun>[],
): TreeDiff {
  const patches: TreeDiff["patches"] = []
  const added: Stored<JobRun>[] = []

  for (const run of flat) {
    const prev = prevNodes[run.id]
    if (!prev) {
      added.push(run)
      continue
    }
    if (runChanged(prev, run)) {
      const patch: Partial<Stored<JobRun>> = {}
      for (const key of PATCH_KEYS) {
        if (prev[key] !== run[key]) {
          ;(patch as Record<string, unknown>)[key] = run[key]
        }
      }
      patches.push({ id: run.id, patch })
    }
  }

  return { patches, added }
}
