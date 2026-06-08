import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { users } from "../generated"
import type { CreateUserDto, UpdateUserDto } from "../generated/models"

export const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const

export const useAdminUsers = () => {
  return useQuery({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: () => users.list(),
  })
}

export const useCreateAdminUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dto: CreateUserDto) => users.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
    },
  })
}

export const useUpdateAdminUser = (userId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dto: UpdateUserDto) => users.update(userId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
    },
  })
}
