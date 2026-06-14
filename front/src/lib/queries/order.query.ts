import type { JobStatus, OrderQuery } from "@miracle/types"
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import {
  ACTIVE_JOB_STATUSES,
  isJobStatusTerminal,
  TERMINAL_JOB_STATUSES,
} from "@/components/blocks/job-tree/job-tree.utils"
import { orders } from "../generated"
import type { AnalyseOrderRequestDto, UpdateOrderDto } from "../generated/models"

export const ORDERS_QUERY_KEY = ["orders"] as const
export const ORDER_JOB_QUERY_KEY = ["order-job"] as const
export const ORDER_POSITIONS_QUERY_KEY = ["order-positions"] as const
export const ORDER_REPORTS_QUERY_KEY = ["order-reports"] as const
export const ORDER_ANALYSIS_VARIANTS_KEY = ["order-analysis-variants"] as const
export const ORDER_ANALYSIS_PARAMS_KEY = ["order-analysis-params"] as const
export const ORDER_ANALYSIS_READINESS_KEY = ["order-analysis-readiness"] as const
export const ORDER_JOB_POLL_INTERVAL_MS = 2500
export const ORDER_READINESS_POLL_INTERVAL_MS = 3000

/** Позиции, отчёты и список job runs после старта или завершения анализа заказа. */
export function invalidateOrderAnalysisResultQueries(queryClient: QueryClient, orderId: string) {
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
      if (run && isJobStatusTerminal(run.status)) return false
      return ORDER_JOB_POLL_INTERVAL_MS
    },
  })

  useEffect(() => {
    const status = query.data?.status
    if (!status) return

    const previousStatus = previousStatusRef.current
    const wasActive = previousStatus !== undefined && ACTIVE_JOB_STATUSES.has(previousStatus)
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

/** Доступные варианты анализа заказа (для дропдауна). */
export const useGetAnalysisVariants = (orderId: string) => {
  return useQuery({
    queryKey: [...ORDER_ANALYSIS_VARIANTS_KEY, orderId] as const,
    queryFn: () => orders.listAnalysisVariants(orderId),
  })
}

/** Схема параметров запуска выбранного варианта (динамический рендер чекбоксов). */
export const useGetAnalysisParams = (orderId: string, variantId: string | undefined) => {
  return useQuery({
    queryKey: [...ORDER_ANALYSIS_PARAMS_KEY, orderId, variantId] as const,
    queryFn: () => {
      if (!variantId) throw new Error("variantId is required")
      return orders.getAnalysisParams(orderId, variantId)
    },
    enabled: Boolean(variantId),
  })
}

/**
 * Готовность заказа к запуску варианта (блокеры). Поллится, пока диалог открыт: подготовка VISUAL
 * и завершение активного прогона снимают блокеры без ручного обновления.
 */
export const useGetAnalysisReadiness = (orderId: string, variantId: string | undefined) => {
  return useQuery({
    queryKey: [...ORDER_ANALYSIS_READINESS_KEY, orderId, variantId] as const,
    queryFn: () => {
      if (!variantId) throw new Error("variantId is required")
      return orders.analysisReadiness(orderId, { variantId })
    },
    enabled: Boolean(variantId),
    refetchInterval: ORDER_READINESS_POLL_INTERVAL_MS,
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
    mutationFn: (request: AnalyseOrderRequestDto) => {
      if (!orderId) throw new Error("Order ID is required")
      return orders.analyse(orderId, request)
    },
    onSuccess: () => {
      if (!orderId) return
      queryClient.invalidateQueries({ queryKey: [...ORDER_JOB_QUERY_KEY, orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDER_ANALYSIS_READINESS_KEY, orderId] })
      invalidateOrderAnalysisResultQueries(queryClient, orderId)
    },
  })
}
