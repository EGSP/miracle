import type { JobRun, Stored } from "@miracle/types"
import { createStore, type StoreApi } from "zustand"
import { buildIndexes } from "./job-tree.utils"

export type JobTreeState = {
  rootId: string
  nodes: Record<string, Stored<JobRun>>
  childrenByParent: Record<string, string[]>
  expanded: Set<string>
  selectedId: string | null
  setRootId: (rootId: string) => void
  setTree: (flat: Stored<JobRun>[]) => void
  applyPatch: (id: string, patch: Partial<Stored<JobRun>>) => void
  addNode: (run: Stored<JobRun>) => void
  toggle: (id: string) => void
  select: (id: string | null) => void
}

export function createJobTreeStore(rootId: string): StoreApi<JobTreeState> {
  return createStore<JobTreeState>((set, get) => ({
    rootId,
    nodes: {},
    childrenByParent: {},
    expanded: new Set([rootId]),
    selectedId: null,

    setRootId: (id) => set({ rootId: id }),

    setTree: (flat) => {
      const { rootId } = get()
      const { nodes, childrenByParent } = buildIndexes(flat, rootId)
      set((s) => ({
        nodes,
        childrenByParent,
        expanded: s.expanded.size > 0 ? s.expanded : new Set([rootId]),
      }))
    },

    applyPatch: (id, patch) =>
      set((s) => {
        const prev = s.nodes[id]
        if (!prev) return s
        return {
          nodes: {
            ...s.nodes,
            [id]: { ...prev, ...patch },
          },
        }
      }),

    addNode: (run) =>
      set((s) => {
        const parentKey = run.parentId ?? s.rootId
        const siblings = s.childrenByParent[parentKey] ?? []
        if (siblings.includes(run.id)) {
          return {
            nodes: { ...s.nodes, [run.id]: run },
          }
        }
        return {
          nodes: { ...s.nodes, [run.id]: run },
          childrenByParent: {
            ...s.childrenByParent,
            [parentKey]: [...siblings, run.id].sort(),
          },
        }
      }),

    toggle: (id) =>
      set((s) => {
        const next = new Set(s.expanded)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { expanded: next }
      }),

    select: (id) => set({ selectedId: id }),
  }))
}

export type JobTreeStore = StoreApi<JobTreeState>
