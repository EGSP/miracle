import { USER_ROLES } from "@miracle/types"
import { useHasAnyRole } from "@/contexts/access"

export function useUserIsAdmin(): boolean {
  return useHasAnyRole([USER_ROLES.ADMIN])
}
