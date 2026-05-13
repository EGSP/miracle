import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { filesContent } from "../generated";

export const FILE_CONTENT_QUERY_KEY = ["file-content"] as const;

export const useGetFileContent = (fileId: string, onlyLast = true, includeDeleted = false) => {
    return useQuery({
        queryKey: [...FILE_CONTENT_QUERY_KEY, fileId, onlyLast, includeDeleted] as const,
        queryFn: () => filesContent.getContent({ fileId }, { onlyLast, includeDeleted }),
        enabled: Boolean(fileId),
    });
};

export const useExtractFileContent = (fileId: string, retryIfLastFailed = true) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => filesContent.extractContent({ fileId }, { retryIfLastFailed }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [...FILE_CONTENT_QUERY_KEY, fileId],
            });
        },
    });
};

/** POST `/files-content/records/:contentId?mark=…` — как {@link filesContentService.softDelete}. */
export const useSoftDeleteFileContent = (fileId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ contentId, mark }: { contentId: string; mark: boolean }) =>
            filesContent.softDelete({ contentId }, { mark }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [...FILE_CONTENT_QUERY_KEY, fileId],
            });
        },
    });
};
