import { USER_ROLE_LABELS, USER_ROLES, type UserRole } from "@miracle/types"

export type RoleOption = {
  value: UserRole
  label: string
}

export const USER_ROLE_OPTIONS: RoleOption[] = [
  { value: USER_ROLES.EMPLOYEE, label: USER_ROLE_LABELS[USER_ROLES.EMPLOYEE] },
  { value: USER_ROLES.ADMIN, label: USER_ROLE_LABELS[USER_ROLES.ADMIN] },
]

export function findRoleOption(role: UserRole | undefined): RoleOption | null {
  return USER_ROLE_OPTIONS.find((option) => option.value === role) ?? null
}
