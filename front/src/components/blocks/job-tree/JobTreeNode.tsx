import { memo, useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { TreeNode } from "@/components/ui/ds/tree-view"
import { JobNodeLabel } from "./JobNodeLabel"
import { useJobTreeStore } from "./JobTreeContext"

function JobTreeNodeInner({
  id,
  parentId,
  level = 1,
}: {
  id: string
  parentId?: string | null
  level?: number
}) {
  const childIds = useJobTreeStore(useShallow((s) => s.childrenByParent[id] ?? []))
  const isExpanded = useJobTreeStore((s) => s.expanded.has(id))
  const isSelected = useJobTreeStore((s) => s.selectedId === id)
  const hasChildren = childIds.length > 0

  const toggle = useJobTreeStore((s) => s.toggle)
  const select = useJobTreeStore((s) => s.select)

  const handleToggle = useCallback(() => toggle(id), [id, toggle])
  const handleSelect = useCallback(() => select(id), [id, select])

  return (
    <TreeNode
      nodeId={id}
      parentId={parentId ?? null}
      label={<JobNodeLabel id={id} />}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      onToggle={handleToggle}
      isSelected={isSelected}
      onSelect={handleSelect}
      level={level}
    >
      {childIds.map((childId) => (
        <JobTreeNode key={childId} id={childId} parentId={id} level={level + 1} />
      ))}
    </TreeNode>
  )
}

export const JobTreeNode = memo(JobTreeNodeInner)
