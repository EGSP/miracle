import { Stack, Text } from "@miracle/aramid"
import type { Stored, User, UserRole } from "@miracle/types"
import { USER_ROLES } from "@miracle/types"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { Input } from "@/components/ui/ds/input"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { useCreateAdminUser } from "@/lib/queries/admin.query"
import { useDialog } from "@/lib/hooks/use-dialog"
import { findRoleOption, USER_ROLE_OPTIONS } from "./user-role-options"

type CreateUserDialogContentProps = {
  onClose: () => void
  onCreated?: (user: Stored<User>) => void
}

function CreateUserDialogContent({ onClose, onCreated }: CreateUserDialogContentProps) {
  const createMutation = useCreateAdminUser()

  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>(USER_ROLES.EMPLOYEE)

  const selectedRole = findRoleOption(role)

  const resetForm = () => {
    setLogin("")
    setPassword("")
    setRole(USER_ROLES.EMPLOYEE)
  }

  const handleCreate = () => {
    createMutation.mutate(
      {
        login: login.trim(),
        password,
        role,
      },
      {
        onSuccess: (created) => {
          resetForm()
          onClose()
          onCreated?.(created)
        },
      },
    )
  }

  const handleCancel = () => {
    resetForm()
    onClose()
  }

  const canSubmit = login.trim().length > 0 && password.length > 0

  const actions: DialogButtonConfig[] = [
    {
      label: "Отмена",
      onClick: handleCancel,
      variant: "secondary",
      disabled: createMutation.isPending,
    },
    {
      label: createMutation.isPending ? "Создание..." : "Создать",
      onClick: handleCreate,
      disabled: createMutation.isPending || !canSubmit,
    },
  ]

  return (
    <Dialog title="Новый пользователь" size="md" onClose={handleCancel} actions={actions}>
      <Stack gap={3}>
        <Input
          type="text"
          label="Логин"
          placeholder="Логин"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          disabled={createMutation.isPending}
        />
        <Input
          type="password"
          label="Пароль"
          placeholder="Пароль"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={createMutation.isPending}
        />
        <Input.Dropdown
          label="Роль"
          items={USER_ROLE_OPTIONS}
          value={selectedRole}
          onChange={(next) => setRole(next?.value ?? USER_ROLES.EMPLOYEE)}
          getItemKey={(item) => item.value}
          disabled={createMutation.isPending}
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
        <InlineMutationNotification mutation={createMutation} successMessage="Пользователь создан" />
      </Stack>
    </Dialog>
  )
}

type CreateUserDialogProps = {
  onCreated?: (user: Stored<User>) => void
}

export function CreateUserDialog({ onCreated }: CreateUserDialogProps) {
  const { open } = useDialog()

  return (
    <Button
      type="button"
      size="sm"
      icon={<Plus />}
      label="Новый"
      onClick={() =>
        open(({ close }) => <CreateUserDialogContent onClose={close} onCreated={onCreated} />)
      }
    />
  )
}
