import type { JobRun, Stored } from "@miracle/types"
import { useCallback, useEffect, useRef } from "react"
import { TreeView } from "@/components/ui/ds/tree-view"
import { jobs } from "@/lib/generated/jobs.client"
import { useJobTreeStore, useJobTreeStoreApi } from "./JobTreeContext"
import { JobTreeNode } from "./JobTreeNode"
import { diffTree, isJobStatusActive } from "./job-tree.utils"

export const JOB_TREE_POLL_INTERVAL_MS = 2500

export type JobTreeProps = {
  rootId: string
  onSelect?: (run: Stored<JobRun>) => void
  /** Вызывается после каждого опроса дерева (initial и интервальный) — для индикатора обновления. */
  onSync?: () => void
}

export function JobTree({ rootId, onSelect, onSync }: JobTreeProps) {
  const store = useJobTreeStoreApi()
  const initializedRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onSyncRef = useRef(onSync)
  onSyncRef.current = onSync

  const selectedId = useJobTreeStore((s) => s.selectedId)

  const syncTree = useCallback(
    async (isInitial: boolean) => {
      try {
        const flat = await jobs.tree(rootId)
        const { nodes, setTree, applyPatch, addNode } = store.getState()

        if (isInitial || !initializedRef.current) {
          setTree(flat)
          initializedRef.current = true
          return
        }

        const { patches, added } = diffTree(nodes, flat)
        for (const { id, patch } of patches) {
          applyPatch(id, patch)
        }
        for (const run of added) {
          addNode(run)
        }
      } catch {
        // тихий retry при следующем интервале
      } finally {
        onSyncRef.current?.()
      }
    },
    [rootId, store],
  )

  useEffect(() => {
    initializedRef.current = false
    let intervalId: number | undefined

    const stopPolling = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    const tick = async (isInitial: boolean) => {
      await syncTree(isInitial)
      const hasActive = Object.values(store.getState().nodes).some((node) =>
        isJobStatusActive(node.status),
      )
      if (hasActive) {
        if (intervalId === undefined) {
          intervalId = window.setInterval(() => void tick(false), JOB_TREE_POLL_INTERVAL_MS)
        }
      } else {
        stopPolling()
      }
    }

    void tick(true)

    return stopPolling
  }, [syncTree, store])

  useEffect(() => {
    if (!selectedId) return
    const run = store.getState().nodes[selectedId]
    if (run) onSelectRef.current?.(run)
  }, [selectedId, store])

  return (
    <TreeView className="job-tree">
      <JobTreeNode id={rootId} parentId={null} level={1} />
    </TreeView>
  )
}
