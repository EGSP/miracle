import type { AnalyseOrderOptions, DesignationWorkerInput, OrderQuery } from "@miracle/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orders } from "../generated"

export const ORDERS_QUERY_KEY = ["orders"] as const
export const ORDER_ANALYSE_AVAILABILITY_QUERY_KEY = ["order-analyse-availability"] as const
export const ORDER_JOB_QUERY_KEY = ["order-job"] as const
export const ORDER_POSITIONS_QUERY_KEY = ["order-positions"] as const

export const useGetOrders = (query: OrderQuery = {}) => {
  return useQuery({
    queryKey: [...ORDERS_QUERY_KEY, query.id, query.authorId, query.fileId] as const,
    queryFn: () => orders.list(query),
  })
}

export const useGetOrder = (id: string) => {
  return useQuery({
    queryKey: [...ORDERS_QUERY_KEY, "one", id] as const,
    queryFn: () => orders.getOne(id),
  })
}

/** Корневой прогон анализа заказа (или null, если не запускался). Поллинг дерева — в самом тайле. */
export const useGetOrderJob = (orderId: string) => {
  return useQuery({
    queryKey: [...ORDER_JOB_QUERY_KEY, orderId] as const,
    queryFn: () => orders.getJob(orderId),
  })
}

/** Позиции заказа вместе с обозначениями (1:1) — для блока продукции в карточке. */
export const useGetOrderPositions = (orderId: string) => {
  return useQuery({
    queryKey: [...ORDER_POSITIONS_QUERY_KEY, orderId] as const,
    queryFn: () => orders.listPositions(orderId),
  })
}

/** Скачивание Excel-отчёта по распознанной продукции заказа (blob → файл). */
export const useDownloadOrderReport = (orderId: string | undefined) => {
  return useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Order ID is required")
      const blob = await orders.report(orderId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `order-${orderId}.xlsx`
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
    mutationFn: () => orders.create({}),
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
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: [...ORDER_JOB_QUERY_KEY, orderId] })
      queryClient.invalidateQueries({ queryKey: [...ORDER_POSITIONS_QUERY_KEY, orderId] })
    },
  })
}

export const useAnalyseOrderDetails = (orderId: string | undefined) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ forceReanalyse = false }: { forceReanalyse?: boolean } = {}) => {
      if (!orderId) throw new Error("Order ID is required")
      return orders.analyseDetails(orderId, {
        forceReanalyse: forceReanalyse ? "true" : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
      queryClient.invalidateQueries({
        queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId],
      })
    },
  })
}

export const useClearAnalysedDetails = (orderId: string | undefined) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => {
      if (!orderId) throw new Error("Order ID is required")
      return orders.clearAnalysed(orderId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
      queryClient.invalidateQueries({
        queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId],
      })
    },
  })
}

export const useCanAnalyseOrderDetails = (orderId: string | undefined) => {
  return useQuery({
    queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] as const,
    queryFn: () => {
      if (!orderId) throw new Error("Order ID is required")
      return orders.canAnalyse(orderId)
    },
  })
}

export const useAnalyseDesignation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DesignationWorkerInput) => orders.analyseDesignation(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
      queryClient.invalidateQueries({
        queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, variables.orderId],
      })
    },
  })
}

export const useUpdateOrder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof orders.update>[1]) =>
      orders.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ORDER_ANALYSE_AVAILABILITY_QUERY_KEY })
    },
  })
}
