import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { file } from "../generated";

export const FILES_QUERY_KEY = ['files'] as const;

export const useGetFiles = () => {
    return useQuery({
        queryKey: FILES_QUERY_KEY,
        queryFn: () => file.getFiles(),
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
