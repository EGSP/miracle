import { Stack, Text } from "@miracle/aramid"
import { RefreshCw } from "lucide-react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { JOB_TREE_POLL_INTERVAL_MS, JobTree } from "@/components/blocks/job-tree/JobTree"
import { JobTreeProvider } from "@/components/blocks/job-tree/JobTreeContext"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrderJob } from "@/lib/queries/order.query"
import "./order-job-tile.css"

const TOTAL_S = Math.round(JOB_TREE_POLL_INTERVAL_MS / 1000)

type RefreshCountdownHandle = { reset: () => void }

/**
 * Изолированный счётчик до следующего обновления дерева. Держит своё состояние и тикает сам —
 * ререндерится только он, не дерево и не страница. Родитель сбрасывает его через ref в `onSync`.
 */
const RefreshCountdown = forwardRef<RefreshCountdownHandle>(function RefreshCountdown(_props, ref) {
  const [remaining, setRemaining] = useState(TOTAL_S)
  const deadlineRef = useRef(Date.now() + JOB_TREE_POLL_INTERVAL_MS)

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        deadlineRef.current = Date.now() + JOB_TREE_POLL_INTERVAL_MS
        setRemaining(TOTAL_S)
      },
    }),
    [],
  )

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)))
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Text.Helper as="span" className="order-job__refresh">
      <RefreshCw className="size-3" />
      обновление через {remaining} с
    </Text.Helper>
  )
})

/** Тело тайла: дерево прогона + заголовок со счётчиком обновления. Под провайдером стора дерева. */
function OrderJobTreeBody({ rootId }: { rootId: string }) {
  const countdownRef = useRef<RefreshCountdownHandle>(null)
  // Стабильный колбэк: дёргает ref, НЕ вызывает setState здесь — дерево от тика не ререндерится.
  const handleSync = useCallback(() => countdownRef.current?.reset(), [])

  return (
    <Stack gap={3}>
      <Stack orientation="horizontal" gap={2} className="items-center justify-between">
        <Text.Heading as="h3" variant="compact-01">
          Анализ
        </Text.Heading>
        <RefreshCountdown ref={countdownRef} />
      </Stack>
      <div className="order-job__tree">
        <JobTree rootId={rootId} onSync={handleSync} />
      </div>
    </Stack>
  )
}

/**
 * Тайл прогресса анализа в карточке заказа. Самодостаточен: тянет корневой прогон заказа, дерево
 * поллит само (через {@link JobTree}), счётчик обновляется интервально. Изолирован — ререндерится
 * только этот тайл (через свою query и стор дерева), не вся страница.
 */
export function OrderJobTile({ orderId }: { orderId: string }) {
  const { data: run, isLoading } = useGetOrderJob(orderId)

  return (
    <Tile>
      {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
      {!isLoading && !run && (
        <Stack gap={2}>
          <Text.Heading as="h3" variant="compact-01">
            Анализ
          </Text.Heading>
          <Text.Helper as="p">Анализ ещё не запускался</Text.Helper>
        </Stack>
      )}
      {run && (
        <JobTreeProvider key={run.id} rootId={run.id}>
          <OrderJobTreeBody rootId={run.id} />
        </JobTreeProvider>
      )}
    </Tile>
  )
}
