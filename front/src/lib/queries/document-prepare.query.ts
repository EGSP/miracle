import type { PrepareStatus } from "@miracle/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { documentPrepare } from "../generated"

export type { PrepareStatus }

const PREPARE_POLL_MS = 3000

export const DOCUMENT_PREPARE_STATUS_KEY = ["document-prepare", "status"] as const
export const PREPARED_DOCUMENT_KEY = ["document-prepare", "prepared"] as const

export function preparedDocumentPreviewSearch(fileId: string) {
  return { fileId } as const
}

export function isDocumentPrepared(status: PrepareStatus | null | undefined): boolean {
  return status === "succeed"
}

/** Можно явно поставить подготовку: нет активного прогона и документ ещё не готов. */
export function canEnqueuePrepare(
  status: PrepareStatus | null | undefined,
  isEnqueuePending = false,
): boolean {
  if (isEnqueuePending) return false
  if (isDocumentPrepared(status)) return false
  return status !== "queued" && status !== "running"
}

/**
 * Поллинг статуса подготовки документа по `fileId`.
 *
 * Ключ запроса уникален на файл — обновления перерисовывают только тот компонент, который этот
 * хук вызвал (лист `ApplicationItem`), не затрагивая соседние элементы заказа. Поллинг
 * останавливается на терминальном статусе (`succeed`/`failed`) и продолжается для `null`/`queued`/
 * `running` (файл после загрузки сам уходит в подготовку через DPS-хук).
 */
export function usePreparedStatus(fileId: string) {
  return useQuery({
    queryKey: [...DOCUMENT_PREPARE_STATUS_KEY, fileId] as const,
    queryFn: () => documentPrepare.getStatus(fileId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "succeed" || status === "failed") return false
      return PREPARE_POLL_MS
    },
  })
}

export function usePrepareDocument(fileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => documentPrepare.prepare(fileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [...DOCUMENT_PREPARE_STATUS_KEY, fileId],
      })
      await queryClient.invalidateQueries({
        queryKey: [...PREPARED_DOCUMENT_KEY, fileId],
      })
    },
  })
}

export function useGetPreparedDocument(fileId: string | undefined) {
  return useQuery({
    queryKey: [...PREPARED_DOCUMENT_KEY, fileId ?? "none"] as const,
    queryFn: () => {
      if (!fileId) throw new Error("fileId is required")
      return documentPrepare.getPrepared(fileId)
    },
    enabled: Boolean(fileId),
  })
}
