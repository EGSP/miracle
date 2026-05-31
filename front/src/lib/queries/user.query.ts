import { useQuery } from "@tanstack/react-query"
import { users } from "../generated"

export function useGetUser(id: string | undefined) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => users.getById(id!),
    enabled: !!id,
  })
}
