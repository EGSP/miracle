export const USER_ROLES = {
    EMPLOYEE: 'EMPLOYEE',
    ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
    [USER_ROLES.EMPLOYEE]: 'Сотрудник',
    [USER_ROLES.ADMIN]: 'Администратор',
};
