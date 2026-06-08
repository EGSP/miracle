import type { AnalyseOrderOptions, JobStatus, OrderQuery } from "@miracle/types"
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { orders } from "../generated"
import type { UpdateOrderDto } from "../generated/models"

export const ORDERS_QUERY_KEY = ["orders"] as const
export const ORDER_JOB_QUERY_KEY = ["order-job"] as const
export const ORDER_POSITIONS_QUERY_KEY = ["order-positions"] as const
export const ORDER_REPORTS_QUERY_KEY = ["order-reports"] as const
export const ORDER_JOB_POLL_INTERVAL_MS = 2500

export const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  "succeed",
  "partial",
  "failed",
  "cancelled",
])

const ACTIVE_JOB_STATUSES = new Set<JobStatus>(["queued", "running"])

/** Позиции, отчёты и список job runs после старта или завершения анализа заказа. */
export function invalidateOrderAnalysisResultQueries(
  queryClient: QueryClient,
  orderId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: [...ORDER_POSITIONS_QUERY_KEY, orderId],
  })
  void queryClient.invalidateQueries({
    queryKey: [...ORDER_REPORTS_QUERY_KEY, orderId],
  })
  void queryClient.invalidateQueries({ queryKey: ["jobs"] })
}

export const useGetOrders = (query: OrderQuery = {}) => {
  return useQuery({
    queryKey: [...ORDERS_QUERY_KEY, query.id, query.authorId] as const,
    queryFn: () => orders.list(query),
  })
}

export const useGetOrder = (id: string) => {
  return useQuery({
    queryKey: [...ORDERS_QUERY_KEY, "one", id] as const,
    queryFn: () => orders.getOne(id),
  })
}

/** Корневой прогон анализа заказа (или null, если не запускался). */
export const useGetOrderJob = (orderId: string) => {
  return useQuery({
    queryKey: [...ORDER_JOB_QUERY_KEY, orderId] as const,
    queryFn: () => orders.getJob(orderId),
  })
}

/** Корневой прогон analyse-order с polling до терминального статуса. */
export const usePollOrderJob = (orderId: string) => {
  const queryClient = useQueryClient()
  const previousStatusRef = useRef<JobStatus | undefined>(undefined)

  const query = useQuery({
    queryKey: [...ORDER_JOB_QUERY_KEY, orderId] as const,
    queryFn: () => orders.getJob(orderId),
    refetchInterval: (q) => {
      const run = q.state.data
      if (run && TERMINAL_JOB_STATUSES.has(run.status)) return false
      return ORDER_JOB_POLL_INTERVAL_MS
    },
  })

  useEffect(() => {
    const status = query.data?.status
    if (!status) return

    const previousStatus = previousStatusRef.current
    const wasActive =
      previousStatus !== undefined && ACTIVE_JOB_STATUSES.has(previousStatus)
    const isTerminal = TERMINAL_JOB_STATUSES.has(status)

    if (wasActive && isTerminal) {
      invalidateOrderAnalysisResultQueries(queryClient, orderId)
    }

    previousStatusRef.current = status
  }, [query.data?.status, orderId, queryClient])

  return query
}

/** Позиции заказа вместе с обозначениями (1:1) — для блока продукции в карточке. */
export const useGetOrderPositions = (orderId: string) => {
  return useQuery({
    queryKey: [...ORDER_POSITIONS_QUERY_KEY, orderId] as const,
    queryFn: () => orders.listPositions(orderId),
  })
}

/** Доступные Excel-отчёты для заказа. */
export const useGetOrderReports = (orderId: string) => {
  return useQuery({
    queryKey: [...ORDER_REPORTS_QUERY_KEY, orderId] as const,
    queryFn: () => orders.listReports(orderId),
  })
}

/** Скачивание Excel-отчёта по распознанной продукции заказа (blob → файл). */
export const useDownloadOrderReport = (orderId: string | undefined) => {
  return useMutation({
    mutationFn: async (reportId: string) => {
      if (!orderId) throw new Error("Order ID is required")
      if (!reportId) throw new Error("Report ID is required")
      const blob = await orders.report(orderId, { reportId })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `order-${orderId}-${reportId}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },
  })
}

export const useCreateOrder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => orders.create(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
    },
  })
}

export const useUpdateOrder = (orderId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateOrderDto) => orders.update(orderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
    },
  })
}

export const useAnalyseOrder = (orderId: string | undefined) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (options: AnalyseOrderOptions) => {
      if (!orderId) throw new Error("Order ID is required")
      return orders.analyse(orderId, options)
    },
    onSuccess: () => {
      if (!orderId) return
      queryClient.invalidateQueries({ queryKey: [...ORDER_JOB_QUERY_KEY, orderId] })
      invalidateOrderAnalysisResultQueries(queryClient, orderId)
    },
  })
}
