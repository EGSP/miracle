import { Text } from "@miracle/aramid"
import type { UserRole } from "@miracle/types"
import { Navigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useAuthContext } from "@/contexts/AuthContext"
import { AuthRequiredPanel } from "@/pages/Auth"
import { useHasAnyRole } from "./useAccessCheck"

type AccessRouteGuardProps = {
  roles: UserRole[]
  children: ReactNode
  redirectTo?: string
}

export function AccessRouteGuard({
  roles,
  children,
  redirectTo = "/",
}: AccessRouteGuardProps) {
  const { isAuthenticated, isSessionPending } = useAuthContext()
  const allowed = useHasAnyRole(roles)

  if (isSessionPending) {
    return <Text.Helper as="p">Проверка сессии…</Text.Helper>
  }

  if (!isAuthenticated) {
    return <AuthRequiredPanel />
  }

  if (!allowed) {
    return <Navigate to={redirectTo} />
  }

  return children
}
