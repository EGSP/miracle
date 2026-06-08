import { Column, Grid, Stack, Text } from "@miracle/aramid"
import type { Stored, User } from "@miracle/types"
import { USER_ROLE_LABELS, USER_ROLES } from "@miracle/types"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { UserRound } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { CreateUserDialog } from "@/components/blocks/user-card/CreateUserDialog"
import { UserCard } from "@/components/blocks/user-card/UserCard"
import { Tile } from "@/components/ui/ds/tile"
import {
  type ListDefinition,
  StructuredList,
  type StructuredListKey,
} from "@/components/ui/ds/structured-list"
import { DirtyGuardProvider, useGuardState } from "@/contexts/dirty-state/DirtyGuardContext"
import { useAdminUsers } from "@/lib/queries/admin.query"

const COL_LIST = 4 as const
const COL_CARD = 12 as const

const userListDefinition: ListDefinition<Stored<User>> = {
  getKey: (user) => user.id,
  columns: [
    {
      key: "icon",
      width: "28px",
      render: () => <UserRound className="size-4 shrink-0 text-muted-foreground" />,
    },
    {
      key: "info",
      width: "1fr",
      rows: [
        {
          key: "login",
          label: "Логин",
          weight: "1fr",
          render: (user) => (
            <Text.Label as="span" className="truncate">
              {user.login ?? "—"}
            </Text.Label>
          ),
        },
        {
          key: "role",
          label: "Роль",
          weight: "1fr",
          render: (user) => (
            <Text.Helper as="span">
              {USER_ROLE_LABELS[user.role ?? USER_ROLES.EMPLOYEE]}
            </Text.Helper>
          ),
        },
      ],
    },
  ],
}

function UsersTabContent() {
  const { userId: userIdParam } = useSearch({ from: "/admin" })
  const navigate = useNavigate({ from: "/admin" })
  const { isDirtyAnywhere } = useGuardState()

  const { data: users, isLoading, error } = useAdminUsers()
  const [selectedUser, setSelectedUser] = useState<Stored<User> | null>(null)

  const selected: StructuredListKey[] = selectedUser ? [selectedUser.id] : []

  const selectUser = useCallback(
    (user: Stored<User> | null) => {
      setSelectedUser(user)
      void navigate({ search: (prev) => ({ ...prev, userId: user?.id }) })
    },
    [navigate],
  )

  const handleSelected = useCallback(
    (keys: StructuredListKey[]) => {
      if (isDirtyAnywhere) return
      const next = users?.find((user) => user.id === keys[0]) ?? null
      selectUser(next)
    },
    [isDirtyAnywhere, users, selectUser],
  )

  const handleCreated = useCallback(
    (user: Stored<User>) => {
      selectUser(user)
    },
    [selectUser],
  )

  useEffect(() => {
    if (!userIdParam || !users) return
    const match = users.find((user) => user.id === userIdParam)
    if (!match) return
    setSelectedUser((prev) => {
      if (prev?.id === match.id && prev.updatedAt === match.updatedAt) return prev
      return match
    })
  }, [userIdParam, users])

  return (
    <Grid withRowGap fullWidth narrow>
      <Column span="100%">
        <CreateUserDialog onCreated={handleCreated} />
      </Column>

      <Column span={COL_LIST}>
        <Stack as="section" gap={3}>
          <Text.Heading as="h2" variant="compact-01">
            Список пользователей
          </Text.Heading>

          {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
          {error && <Text.Helper as="p">Ошибка: {error.message}</Text.Helper>}
          {!isLoading && !error && (!users || users.length === 0) && (
            <Text.Helper as="p">Пользователи не найдены</Text.Helper>
          )}
          {users && users.length > 0 && (
            <StructuredList
              definition={userListDefinition}
              items={users}
              selected={selected}
              onSelected={handleSelected}
              overflow={8}
            />
          )}
        </Stack>
      </Column>

      <Column span={COL_CARD}>
        {selectedUser ? (
          <UserCard
            key={selectedUser.id}
            user={selectedUser}
            onUserSaved={(saved) => setSelectedUser(saved)}
          />
        ) : (
          <Tile>
            <Text as="p" compact>
              Выберите пользователя в списке слева.
            </Text>
          </Tile>
        )}
      </Column>
    </Grid>
  )
}

export function UsersTab() {
  return (
    <DirtyGuardProvider confirmMessage="Есть несохранённые изменения. Смена пользователя недоступна.">
      <UsersTabContent />
    </DirtyGuardProvider>
  )
}
