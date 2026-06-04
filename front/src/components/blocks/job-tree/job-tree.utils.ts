import type { JobRun, Stored } from "@miracle/types"

export type JobTreeIndexes = {
  nodes: Record<string, Stored<JobRun>>
  childrenByParent: Record<string, string[]>
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

  for (const key of Object.keys(childrenByParent)) {
    childrenByParent[key].sort()
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
