import { useMutation } from "@tanstack/react-query";
import { file } from "../generated";

export const useUploadFile = () => {
    return useMutation({
        mutationFn: (fileToUpload: File) => {
            const formData = new FormData();
            formData.append('file', fileToUpload);
            return file.uploadFile(formData);
        },
    });
};
