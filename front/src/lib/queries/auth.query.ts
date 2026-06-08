import { useMutation, useQueryClient } from "@tanstack/react-query"
import { auth } from "../generated"
import type { LoginDto, RegisterDto } from "../generated/models"
import { useAuthStore } from "../stores/auth.store"
import { invalidateCookieSession } from "./sessions.query"

export const useLogin = ({ login, password }: LoginDto) => {
  const authStore = useAuthStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return await auth.login({ login, password })
    },
    onSuccess: (data) => {
      authStore.setStatus("valid")
    },
    onError: (error) => {
      authStore.setStatus("unauthorized")
    },
    onSettled: () => {
      invalidateCookieSession(queryClient)
    },
  })
}

export const useRegister = ({ login, password }: RegisterDto) => {
  const authStore = useAuthStore()
  return useMutation({
    mutationFn: async () => {
      return await auth.register({ login, password })
    },
  })
}

export const useLogout = () => {
  const authStore = useAuthStore()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      return await auth.logout()
    },
    onSuccess: () => {
      authStore.setStatus("unauthorized")
      window.location.reload()
    },
    onError: () => {
      authStore.setStatus("unauthorized")
    },
    onSettled: () => {
      invalidateCookieSession(queryClient)
    },
  })
}
