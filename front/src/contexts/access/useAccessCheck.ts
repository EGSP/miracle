import type { UserRole } from "@miracle/types"
import { useAuthContext } from "@/contexts/AuthContext"

export function useUserRole(): UserRole | undefined {
  return useAuthContext().role
}

export function useHasAnyRole(roles: UserRole[]): boolean {
  const role = useUserRole()
  if (role === undefined) return false
  return roles.includes(role)
}

export function useIsRoleExcluded(excludes: UserRole[]): boolean {
  const role = useUserRole()
  if (role === undefined) return false
  return excludes.includes(role)
}
