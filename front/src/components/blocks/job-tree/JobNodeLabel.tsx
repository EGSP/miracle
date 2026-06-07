import { latestJobProgressState } from "@miracle/types"
import { memo } from "react"
import { InlineProgressBar } from "@/components/ui/ds/progress-bar"
import { useJobTreeStore } from "./JobTreeContext"
import { jobStatusToProgressBarStatus } from "./job-tree.utils"
import "./job-tree.css"

function JobNodeLabelInner({ id }: { id: string }) {
  const node = useJobTreeStore((s) => s.nodes[id])
  if (!node) return null

  const latest = latestJobProgressState(node.progress)

  return (
    <span className="job-node">
      <span className="job-node__job">{node.job}</span>
      {latest && (
        <span className="job-node__progress">
          <span className="job-node__progress-label">{latest.label}</span>
          <InlineProgressBar
            className="job-node__progress-bar"
            ariaLabel={`${node.job}: ${latest.label}`}
            status={jobStatusToProgressBarStatus(node.status)}
            fill={latest.percentNormalized}
            determinate={latest.determined}
            variant="medium"
            compact
          />
        </span>
      )}
    </span>
  )
}

export const JobNodeLabel = memo(JobNodeLabelInner)
