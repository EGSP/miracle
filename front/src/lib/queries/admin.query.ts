import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { admin } from "../generated"
import type { CreateUserDTO } from "../generated/models"

export const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const

export const useAdminUsers = () => {
  return useQuery({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: () => admin.listUsers(),
  })
}

export const useCreateAdminUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dto: CreateUserDTO) => admin.createUser(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
    },
  })
}
