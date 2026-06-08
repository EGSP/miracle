import type { UserRole } from "@miracle/types"
import type { ReactNode } from "react"
import { useIsRoleExcluded, useUserRole } from "./useAccessCheck"

type AccessGuardExcludeProps = {
  excludes: UserRole[]
  fallback?: ReactNode
  children: ReactNode
}

export function AccessGuardExclude({ excludes, fallback = null, children }: AccessGuardExcludeProps) {
  const role = useUserRole()
  const excluded = useIsRoleExcluded(excludes)

  if (role === undefined || excluded) {
    return fallback
  }

  return children
}
