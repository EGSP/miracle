import type { UserRole } from "@miracle/types"
import { Navigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useAuthContext } from "@/contexts/AuthContext"
import { useHasAnyRole } from "./useAccessCheck"

type AccessRouteGuardProps = {
  roles: UserRole[]
  children: ReactNode
  loginTo?: string
  redirectTo?: string
}

export function AccessRouteGuard({
  roles,
  children,
  loginTo = "/auth/login",
  redirectTo = "/",
}: AccessRouteGuardProps) {
  const { isAuthenticated } = useAuthContext()
  const allowed = useHasAnyRole(roles)

  if (!isAuthenticated) {
    return <Navigate to={loginTo} />
  }

  if (!allowed) {
    return <Navigate to={redirectTo} />
  }

  return children
}
