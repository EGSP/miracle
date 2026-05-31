import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query"
import { session } from "../generated"

export function useGetCookieSession() {
  return useQuery({
    queryKey: ["cookie-session"],
    queryFn: () => session.getCookieSession(),
  })
}

export function invalidateCookieSession(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["cookie-session"] })
}
