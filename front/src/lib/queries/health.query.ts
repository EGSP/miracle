import { useQuery, useQueryClient } from "@tanstack/react-query"
import { health } from "../generated/health.client"

export const useCheckHealth = () => {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => health.checkHealth(),
  })
}

export function useRefetchHealth() {
  const queryClient = useQueryClient()

  return () => queryClient.invalidateQueries({ queryKey: ["health"] })
}
