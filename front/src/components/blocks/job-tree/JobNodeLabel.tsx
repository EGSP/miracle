import { memo } from "react"
import { InlineProgressBar } from "@/components/ui/ds/progress-bar"
import { useJobTreeStore } from "./JobTreeContext"
import { jobStatusToProgressBarStatus, resolveJobNodeProgress } from "./job-tree.utils"
import "./job-tree.css"

function JobNodeLabelInner({ id }: { id: string }) {
  const node = useJobTreeStore((s) => s.nodes[id])
  if (!node) return null

  const progress = resolveJobNodeProgress(node)

  return (
    <span className="job-node">
      <span className="job-node__job">{node.job}</span>
      {progress && (
        <span className="job-node__progress">
          <span className="job-node__progress-label">{progress.label}</span>
          <InlineProgressBar
            className="job-node__progress-bar"
            ariaLabel={`${node.job}: ${progress.label}`}
            status={jobStatusToProgressBarStatus(node.status)}
            fill={progress.fill}
            determinate={progress.determinate}
            variant="medium"
            compact
          />
        </span>
      )}
    </span>
  )
}

export const JobNodeLabel = memo(JobNodeLabelInner)
