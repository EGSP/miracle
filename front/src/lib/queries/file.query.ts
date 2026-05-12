import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { file } from "../generated";
import type { PatchFileDTO } from "../generated/models/file.models";
import type { FilesQuery } from "@miracle/types";

export const FILES_QUERY_KEY = ['files'] as const;

export const useGetFiles = (query: FilesQuery = {}) => {
    return useQuery({
        queryKey: [...FILES_QUERY_KEY, query.id, query.authorId, query.available, query.includeMeta] as const,
        queryFn: () => file.getFiles(query),
    });
};

export const useUploadFile = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (fileToUpload: File) => {
            const formData = new FormData();
            formData.append('file', fileToUpload);
            return file.uploadFile(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY });
        },
    });
};

export const usePatchFile = (fileId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: PatchFileDTO) => file.patchFile({ id: fileId }, dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY });
        },
    });
};

export const useRestoreFile = (fileId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (fileToRestore: File) => {
            const formData = new FormData();
            formData.append('file', fileToRestore);
            return file.restoreFile({ id: fileId }, formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY });
        },
    });
};
