import { Stack, Text } from "@miracle/aramid"
import type { Stored, User, UserRole } from "@miracle/types"
import { USER_ROLES } from "@miracle/types"
import { Button } from "@/components/ui/ds/button"
import { Input } from "@/components/ui/ds/input"
import { Tile } from "@/components/ui/ds/tile"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { DirtyGuardProvider, useGuardActions, useGuardState } from "@/contexts/dirty-state/DirtyGuardContext"
import { useField } from "@/contexts/dirty-state/useField"
import { useUpdateAdminUser } from "@/lib/queries/admin.query"
import { findRoleOption, USER_ROLE_OPTIONS } from "./user-role-options"

type UserCardProps = {
  user: Stored<User>
  onUserSaved?: (user: Stored<User>) => void
}

function formatDate(value: Date | string | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function UserCardContent({ user, onUserSaved }: UserCardProps) {
  const updateMutation = useUpdateAdminUser(user.id)
  const { commitAll, resetAll } = useGuardActions()
  const { isDirtyAnywhere } = useGuardState()

  const role = useField<UserRole>(`user-${user.id}-role`, user.role ?? USER_ROLES.EMPLOYEE)
  const selectedRole = findRoleOption(role.value)

  const handleSave = () => {
    if (!role.isDirty) return

    updateMutation.mutate(
      { role: role.value },
      {
        onSuccess: (saved) => {
          commitAll()
          onUserSaved?.(saved)
        },
      },
    )
  }

  const handleReset = () => {
    resetAll()
  }

  return (
    <Tile as="article">
      <Stack gap={3}>
        <Stack gap={1}>
          <Text.Heading as="p" variant="03">
            {user.login ?? "Без логина"}
          </Text.Heading>
          <Text.Helper as="p">ID: {user.id}</Text.Helper>
        </Stack>

        <Stack gap={2}>
          <Stack orientation="horizontal" gap={2} className="flex-wrap items-center">
            <Button
              type="button"
              size="md"
              label={updateMutation.isPending ? "Сохранение..." : "Сохранить"}
              disabled={!isDirtyAnywhere || updateMutation.isPending}
              onClick={handleSave}
            />
            <Button
              type="button"
              size="md"
              variant="secondary"
              label="Сбросить"
              disabled={!isDirtyAnywhere || updateMutation.isPending}
              onClick={handleReset}
            />
          </Stack>
          <InlineMutationNotification
            mutation={updateMutation}
            successMessage="Изменения сохранены"
          />
        </Stack>

        <Stack gap={3}>
          <Text.Heading as="p" variant="compact-01">
            Данные пользователя
          </Text.Heading>
          <Input
            label="Логин"
            value={user.login ?? ""}
            readOnly
            disabled
            helperText="Изменение логина пока недоступно"
          />
          <Input.Dropdown
            label="Роль"
            items={USER_ROLE_OPTIONS}
            value={selectedRole}
            onChange={(next) => role.onChange(next?.value ?? USER_ROLES.EMPLOYEE)}
            getItemKey={(item) => item.value}
            disabled={updateMutation.isPending}
            renderSelectedItem={(item) => (
              <Text as="span" compact>
                {item?.label ?? USER_ROLE_OPTIONS[0].label}
              </Text>
            )}
            renderListItem={(item) => (
              <Text as="span" compact>
                {item?.label ?? ""}
              </Text>
            )}
          >
            <Input.Dropdown.Selected />
            <Input.Dropdown.List />
          </Input.Dropdown>
          <Input label="Создан" value={formatDate(user.createdAt)} readOnly disabled />
          <Input label="Обновлён" value={formatDate(user.updatedAt)} readOnly disabled />
        </Stack>
      </Stack>
    </Tile>
  )
}

export function UserCard({ user, onUserSaved }: UserCardProps) {
  return (
    <DirtyGuardProvider
      id={`user-card-${user.id}`}
      key={`${user.id}-${user.updatedAt}`}
    >
      <UserCardContent user={user} onUserSaved={onUserSaved} />
    </DirtyGuardProvider>
  )
}
