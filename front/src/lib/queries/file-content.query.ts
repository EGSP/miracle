import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { filesContent } from "../generated"

export const FILE_CONTENT_QUERY_KEY = ["file-content"] as const

export const useGetFileContent = (fileId: string, onlyLast = true, includeDeleted = false) => {
  return useQuery({
    queryKey: [...FILE_CONTENT_QUERY_KEY, fileId, onlyLast, includeDeleted] as const,
    queryFn: () => filesContent.getContent(fileId, { onlyLast, includeDeleted }),
    enabled: Boolean(fileId),
  })
}

export const useGetFileContentTokens = (fileId: string, contentId: string | undefined) => {
  return useQuery({
    queryKey: [...FILE_CONTENT_QUERY_KEY, fileId, "tokens", contentId] as const,
    queryFn: () => filesContent.getTokens(contentId!),
    enabled: Boolean(fileId && contentId),
  })
}

export const useExtractFileContent = (_fileId: string) => {
  return useMutation({
    mutationFn: (_options?: { retryIfLastFailed?: boolean }) => {
      throw new Error(
        "Извлечение через FileContent устарело. Используйте Document Prepare Service: POST /documents/:fileId/prepare.",
      )
    },
  })
}

/** POST `/files-content/records/:contentId?mark=…` */
export const useSoftDeleteFileContent = (fileId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contentId, mark }: { contentId: string; mark: boolean }) =>
      filesContent.softDelete(contentId, { mark }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [...FILE_CONTENT_QUERY_KEY, fileId],
      })
    },
  })
}
