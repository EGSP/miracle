import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { users } from "../generated"
import type { CreateUserDto, UpdateUserDto } from "../generated/models"

export const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const

export const adminUserSessionsQueryKey = (userId: string) =>
  ["admin", "users", userId, "sessions"] as const

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

export const useAdminUserSessions = (userId: string) => {
  return useQuery({
    queryKey: adminUserSessionsQueryKey(userId),
    queryFn: () => users.listSessions(userId),
  })
}

export const useDeleteAdminUserSessions = (userId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => users.deleteSessions(userId, { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserSessionsQueryKey(userId) })
    },
  })
}

export const useDeleteAllAdminUserSessions = (userId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => users.deleteAllSessions(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserSessionsQueryKey(userId) })
    },
  })
}
