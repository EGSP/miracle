import type { FileModel, FilesQuery } from "@miracle/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { files } from "../generated"
import type { PatchFileDto } from "../generated/models"

export const FILES_QUERY_KEY = ["files"] as const

export const useGetFiles = (query: FilesQuery = {}) => {
  return useQuery({
    queryKey: [
      ...FILES_QUERY_KEY,
      query.id,
      query.authorId,
      query.available,
      query.includeMeta,
      query.isTechnicalCondition,
    ] as const,
    queryFn: () => files.getFiles(query),
  })
}

export const useUploadFile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fileToUpload: File) => files.upload(fileToUpload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY })
    },
  })
}

export const useUploadFileWithSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      fileToUpload,
      settings,
    }: {
      fileToUpload: File
      settings?: FileModel["settings"]
    }) => {
      const uploaded = await files.upload(fileToUpload)

      const hasSettings = settings && Object.values(settings).some(Boolean)
      if (hasSettings) {
        await files.patch(uploaded.id, { settings })
      }

      return uploaded
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY })
    },
  })
}

export const usePatchFile = (fileId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dto: PatchFileDto) => files.patch(fileId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY })
    },
  })
}

export const useRestoreFile = (fileId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fileToRestore: File) => files.restore(fileId, fileToRestore),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY })
    },
  })
}
