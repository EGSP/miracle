import { useQuery, useQueryClient } from "@tanstack/react-query"
import { health } from "../generated"

export const useCheckHealth = () => {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => health.check(),
  })
}

export function useRefetchHealth() {
  const queryClient = useQueryClient()

  return () => queryClient.invalidateQueries({ queryKey: ["health"] })
}
