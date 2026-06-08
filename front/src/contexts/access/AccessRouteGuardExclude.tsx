import type { UserRole } from "@miracle/types"
import { Navigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useAuthContext } from "@/contexts/AuthContext"
import { useIsRoleExcluded, useUserRole } from "./useAccessCheck"

type AccessRouteGuardExcludeProps = {
  excludes: UserRole[]
  children: ReactNode
  loginTo?: string
  redirectTo?: string
}

export function AccessRouteGuardExclude({
  excludes,
  children,
  loginTo = "/auth/login",
  redirectTo = "/",
}: AccessRouteGuardExcludeProps) {
  const { isAuthenticated } = useAuthContext()
  const role = useUserRole()
  const excluded = useIsRoleExcluded(excludes)

  if (!isAuthenticated) {
    return <Navigate to={loginTo} />
  }

  if (role === undefined || excluded) {
    return <Navigate to={redirectTo} />
  }

  return children
}
