import type { WorkersQuery } from "@miracle/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { workers } from "../generated"
import { FILE_CONTENT_QUERY_KEY } from "./file-content.query"
import { ORDERS_QUERY_KEY } from "./order.query"

export const workersQueryKey = (params: WorkersQuery) => ["workers", params] as const

/** Список воркеров с фильтрацией по статусу и сортировкой. Обновляется каждые 3 секунды. */
export const useGetWorkers = (params: WorkersQuery = {}) => {
  return useQuery({
    queryKey: workersQueryKey(params),
    queryFn: () => workers.getWorkers(params),
    refetchInterval: 3_000,
  })
}

/** POST `/workers/:id/apply-worker-data` — перенос сохранённого результата в file-content / заказ. */
export const useApplyWorkerData = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (workerId: string) => workers.applyWorkerData({ id: workerId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workers"] }),
        queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: FILE_CONTENT_QUERY_KEY }),
      ])
    },
  })
}

/** GET `/workers/:id/preview-prompt` — собранный промпт по input воркера (для отладки). */
export const useWorkerPromptPreview = (workerId: string | undefined) => {
  return useQuery({
    queryKey: ["workers", workerId, "preview-prompt"] as const,
    queryFn: () => {
      if (!workerId) throw new Error("Worker id required")
      return workers.previewPrompt({ id: workerId })
    },
    enabled: !!workerId,
    // Промпт собирается по текущим Order/TC — иногда хочется свежий, иногда нет.
    // Кэшируем по умолчанию, но даём react-query инвалидировать при перезагрузке страницы.
  })
}

/** DELETE `/workers/:id` — удаляет воркера (кроме active). */
export const useDeleteWorker = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (workerId: string) => workers.deleteWorker({ id: workerId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workers"] })
    },
  })
}
