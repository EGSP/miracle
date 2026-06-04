import type { JobRun, Stored } from "@miracle/types"
import { useCallback, useEffect, useRef } from "react"
import { TreeView } from "@/components/ui/ds/tree-view"
import { jobs } from "@/lib/generated/jobs.client"
import { useJobTreeStore, useJobTreeStoreApi } from "./JobTreeContext"
import { JobTreeNode } from "./JobTreeNode"
import { diffTree } from "./job-tree.utils"

const POLL_INTERVAL_MS = 2500

export type JobTreeProps = {
  rootId: string
  onSelect?: (run: Stored<JobRun>) => void
}

export function JobTree({ rootId, onSelect }: JobTreeProps) {
  const store = useJobTreeStoreApi()
  const initializedRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

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
      }
    },
    [rootId, store],
  )

  useEffect(() => {
    initializedRef.current = false
    void syncTree(true)
    const id = window.setInterval(() => void syncTree(false), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [syncTree])

  useEffect(() => {
    if (!selectedId) return
    const run = store.getState().nodes[selectedId]
    if (run) onSelectRef.current?.(run)
  }, [selectedId, store])

  return (
    <TreeView>
      <JobTreeNode id={rootId} parentId={null} level={1} />
    </TreeView>
  )
}
