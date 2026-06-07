import { latestJobProgressState } from "@miracle/types"
import { Text } from "@miracle/aramid"
import { memo } from "react"
import { jobStatusToProgressBarStatus } from "@/components/blocks/job-tree/job-tree.utils"
import { ProgressBar } from "@/components/ui/ds/progress-bar"
import { usePollOrderJob } from "@/lib/queries/order.query"

function OrderAnalyseProgressInner({ orderId }: { orderId: string }) {
  const { data: run, isLoading } = usePollOrderJob(orderId)

  if (isLoading) {
    return <Text.Helper as="p">Загрузка прогресса…</Text.Helper>
  }

  if (!run) {
    return <Text.Helper as="p">Анализ ещё не запускался</Text.Helper>
  }

  const latestProgress = latestJobProgressState(run.progress)
  if (!latestProgress) {
    return <Text.Helper as="p">Прогресс анализа недоступен</Text.Helper>
  }

  return (
    <ProgressBar
      label={latestProgress.label}
      helperText={
        latestProgress.determined
          ? `${Math.round(latestProgress.percentNormalized * 100)}%`
          : undefined
      }
      status={jobStatusToProgressBarStatus(run.status)}
      fill={latestProgress.percentNormalized}
      determinate={latestProgress.determined}
      compact
    />
  )
}

/** Прогресс корневого analyse-order; polling изолирован в этом компоненте. */
export const OrderAnalyseProgress = memo(OrderAnalyseProgressInner)
