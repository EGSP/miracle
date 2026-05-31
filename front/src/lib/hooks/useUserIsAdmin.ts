import { USER_ROLES } from "@miracle/types"
import { useAuthContext } from "@/contexts/AuthContext"

export function useUserIsAdmin(): boolean {
  const { role } = useAuthContext()
  return role === USER_ROLES.ADMIN
}
