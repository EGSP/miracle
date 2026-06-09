import { Text } from "@miracle/aramid"
import type { UserRole } from "@miracle/types"
import { Navigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useAuthContext } from "@/contexts/AuthContext"
import { AuthRequiredPanel } from "@/pages/Auth"
import { useIsRoleExcluded, useUserRole } from "./useAccessCheck"

type AccessRouteGuardExcludeProps = {
  excludes: UserRole[]
  children: ReactNode
  redirectTo?: string
}

export function AccessRouteGuardExclude({
  excludes,
  children,
  redirectTo = "/",
}: AccessRouteGuardExcludeProps) {
  const { isAuthenticated, isSessionPending } = useAuthContext()
  const role = useUserRole()
  const excluded = useIsRoleExcluded(excludes)

  if (isSessionPending) {
    return <Text.Helper as="p">Проверка сессии…</Text.Helper>
  }

  if (!isAuthenticated) {
    return <AuthRequiredPanel />
  }

  if (role === undefined || excluded) {
    return <Navigate to={redirectTo} />
  }

  return children
}
