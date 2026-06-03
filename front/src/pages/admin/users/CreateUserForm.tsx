import { Stack, Text } from "@miracle/aramid"
import { USER_ROLE_LABELS, USER_ROLES, type UserRole } from "@miracle/types"
import { useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { Input } from "@/components/ui/ds/input"
import { getApiErrorMessage } from "@/lib/api"
import { useCreateAdminUser } from "@/lib/queries/admin.query"

const ROLE_OPTIONS: UserRole[] = [USER_ROLES.EMPLOYEE, USER_ROLES.ADMIN]

export function CreateUserForm() {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>(USER_ROLES.EMPLOYEE)

  const { mutate: createUser, isPending, isError, error, isSuccess, reset } = useCreateAdminUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createUser(
      { login: login.trim(), password, role },
      {
        onSuccess: () => {
          setLogin("")
          setPassword("")
          setRole(USER_ROLES.EMPLOYEE)
          reset()
        },
      },
    )
  }

  return (
    <Stack as="form" gap={3} onSubmit={handleSubmit}>
      <Text.Heading as="h2" variant="02">
        Создать пользователя
      </Text.Heading>

      {isError && (
        <Text as="p" compact className="text-destructive">
          {getApiErrorMessage(error)}
        </Text>
      )}
      {isSuccess && (
        <Text as="p" compact>
          Пользователь создан
        </Text>
      )}

      <Input
        type="text"
        placeholder="Логин"
        autoComplete="username"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        disabled={isPending}
        required
      />
      <Input
        type="password"
        placeholder="Пароль"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={isPending}
        required
      />
      <label className="flex flex-col gap-1">
        <Text.Label as="span">Роль</Text.Label>
        <select
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isPending}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {USER_ROLE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="submit"
        label={isPending ? "Создание..." : "Создать"}
        disabled={isPending || !login.trim() || !password}
      />
    </Stack>
  )
}
