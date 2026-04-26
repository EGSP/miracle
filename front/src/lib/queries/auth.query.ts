import { useMutation } from "@tanstack/react-query";
import api from "../api";
import { auth } from "../generated";
import { LoginDTO, RegisterDTO } from "../generated/models";
import { useAuthStore } from "../stores/auth.store";

export const useLogin = ({ login, password }: LoginDTO) => {
    const authStore = useAuthStore();
    return useMutation({
        mutationFn: async () => {
            return await auth.login({ login, password });
        },
        onSuccess: (data) => {
            authStore.setStatus('valid');
        },
        onError: (error) => {
            authStore.setStatus('unauthorized');
        },
    });
};
export const useRegister = ({ login, password }: RegisterDTO) => {
    const authStore = useAuthStore();
    return useMutation({
        mutationFn: async () => {
            return await auth.register({ login, password });
        },
    });
};