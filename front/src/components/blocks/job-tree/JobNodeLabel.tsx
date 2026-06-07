import { latestJobProgressState } from "@miracle/types"
import { memo } from "react"
import { useJobTreeStore } from "./JobTreeContext"
import "./job-tree.css"

function JobNodeLabelInner({ id }: { id: string }) {
  const node = useJobTreeStore((s) => s.nodes[id])
  if (!node) return null

  const latest = latestJobProgressState(node.progress)
  const progressLabel = latest?.label
  const progress =
    progressLabel ??
    (latest?.percentNormalized != null
      ? `${Math.round(latest.percentNormalized * 100)}%`
      : null)

  return (
    <span className="job-node">
      <span
        className={`job-node__dot job-node__dot--${node.status}`}
        aria-hidden="true"
      />
      <span className="job-node__job">{node.job}</span>
      <span className="job-node__status">{node.status}</span>
      {progress && <span className="job-node__progress">{progress}</span>}
    </span>
  )
}

export const JobNodeLabel = memo(JobNodeLabelInner)
