/**
 * useApplicationFileUpload
 *
 * Аналог useFileInputUpload, но загружает файлы как приложения заказа
 * через POST /order/:id/applications/file (один запрос на файл).
 * После каждого успешного upload инвалидирует кеш приложений заказа.
 */

import { useRef, useState } from "react"
import type { AppliedFile, FileState } from "@/components/ui/ds/file-input"
import { getApiErrorMessage } from "@/lib/api"
import { orderApplicationsKey } from "@/lib/queries/order-application.query"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orders } from "@/lib/generated"

export function useApplicationFileUpload(orderId: string) {
  const queryClient = useQueryClient()
  const [fileStates, setFileStates] = useState<FileState[]>([])
  const fileStatesRef = useRef(fileStates)
  fileStatesRef.current = fileStates

  const uploadMutation = useMutation({
    mutationFn: (file: File) => orders.addFileApplication(orderId, file),
  })

  function patchState(id: string, patch: Partial<FileState>) {
    setFileStates((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function handleFilesApplied(applied: AppliedFile[]) {
    const newStates: FileState[] = applied.map(({ file, validationError }) => ({
      id: crypto.randomUUID(),
      file,
      status: validationError ? "error" : "applied",
      error: validationError,
    }))
    setFileStates((prev) => [...prev, ...newStates])
  }

  function handleRemove(id: string) {
    setFileStates((prev) => prev.filter((s) => s.id !== id))
  }

  async function upload() {
    const toUpload = fileStatesRef.current.filter((s) => s.status === "applied")
    for (const state of toUpload) {
      patchState(state.id, { status: "uploading" })
      try {
        await uploadMutation.mutateAsync(state.file)
        patchState(state.id, { status: "success" })
        queryClient.invalidateQueries({ queryKey: orderApplicationsKey(orderId) })
      } catch (e) {
        patchState(state.id, {
          status: "error",
          error: { label: getApiErrorMessage(e) },
        })
      }
    }
  }

  const hasApplied = fileStates.some((s) => s.status === "applied")
  const isUploading = fileStates.some((s) => s.status === "uploading")
  const allDone =
    fileStates.length > 0 && fileStates.every((s) => s.status === "success" || s.status === "error")

  return {
    fileStates,
    onFilesApplied: handleFilesApplied,
    onRemove: handleRemove,
    upload,
    hasApplied,
    isUploading,
    allDone,
  }
}
