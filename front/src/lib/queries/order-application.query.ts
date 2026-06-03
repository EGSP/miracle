import type { OrderApplication, Stored } from "@miracle/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orders } from "../generated"

export const orderApplicationsKey = (orderId: string) =>
  ["order-applications", orderId] as const

export const useGetOrderApplications = (orderId: string) =>
  useQuery({
    queryKey: orderApplicationsKey(orderId),
    queryFn: () => orders.listApplications(orderId),
  })

export const useAddTextApplication = (orderId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => orders.addTextApplication(orderId, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderApplicationsKey(orderId) })
    },
  })
}

export const useRemoveApplication = (orderId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (appId: string) => orders.removeApplication(orderId, appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderApplicationsKey(orderId) })
    },
  })
}
