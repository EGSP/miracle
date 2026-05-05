import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { filesContent } from "../generated";

export const FILE_CONTENT_QUERY_KEY = ["file-content"] as const;

export const useGetFileContent = (fileId: string, onlyLast = true) => {
    return useQuery({
        queryKey: [...FILE_CONTENT_QUERY_KEY, fileId, onlyLast] as const,
        queryFn: () => filesContent.getContent({ fileId, onlyLast }),
        enabled: Boolean(fileId),
    });
};

export const useExtractFileContent = (fileId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => filesContent.extractContent({ fileId }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [...FILE_CONTENT_QUERY_KEY, fileId],
            });
        },
    });
};
