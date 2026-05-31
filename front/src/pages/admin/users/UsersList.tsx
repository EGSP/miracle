import { Column, Stack, Text } from "@miracle/aramid"
import type { User } from "@miracle/types"
import { USER_ROLE_LABELS, USER_ROLES } from "@miracle/types"
import { useAdminUsers } from "@/lib/queries/admin.query"

export function UsersList() {
  const { data: users, isLoading, error } = useAdminUsers()

  if (isLoading) {
    return <Text.Label as="p">Загрузка пользователей...</Text.Label>
  }

  if (error) {
    return (
      <Text as="p" compact className="text-destructive">
        Ошибка: {error.message}
      </Text>
    )
  }

  if (!users?.length) {
    return <Text.Label as="p">Пользователи не найдены</Text.Label>
  }

  return (
    <>
      <Text.Heading as="h2" variant="02">
        Пользователи
      </Text.Heading>
      <Stack gap={2} as="ul" className="list-none p-0 m-0">
        {users.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </Stack>
    </>
  )
}

function UserRow({ user }: { user: User }) {
  const roleLabel = USER_ROLE_LABELS[user.role ?? USER_ROLES.EMPLOYEE]

  return (
    <Column as="li" span={16} className="rounded border border-border px-3 py-2">
      <Stack gap={1}>
        <Text.Label as="span">{user.login ?? "—"}</Text.Label>
        <Text as="span" compact className="text-muted-foreground">
          ID: {user.id ?? "—"} · {roleLabel}
        </Text>
      </Stack>
    </Column>
  )
}
