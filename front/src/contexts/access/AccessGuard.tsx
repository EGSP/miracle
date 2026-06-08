import type { UserRole } from "@miracle/types"
import type { ReactNode } from "react"
import { useHasAnyRole } from "./useAccessCheck"

type AccessGuardProps = {
  roles: UserRole[]
  fallback?: ReactNode
  children: ReactNode
}

export function AccessGuard({ roles, fallback = null, children }: AccessGuardProps) {
  const allowed = useHasAnyRole(roles)
  return allowed ? children : fallback
}
