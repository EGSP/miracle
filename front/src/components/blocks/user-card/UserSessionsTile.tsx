import { Stack, Text } from "@miracle/aramid"
import type { PublicSession, Stored } from "@miracle/types"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/ds/button"
import {
  type ListDefinition,
  StructuredList,
  type StructuredListKey,
} from "@/components/ui/ds/structured-list"
import { Tile } from "@/components/ui/ds/tile"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import {
  useAdminUserSessions,
  useDeleteAdminUserSessions,
  useDeleteAllAdminUserSessions,
} from "@/lib/queries/admin.query"

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

const sessionListDefinition: ListDefinition<Stored<PublicSession>> = {
  getKey: (session) => session.id,
  columns: [
    {
      key: "id",
      label: "ID",
      width: "4fr",
      render: (session) => (
        <Text.Label as="span" className="truncate">
          {session.id}
        </Text.Label>
      ),
    },
    {
      key: "created",
      label: "Создана",
      width: "2fr",
      render: (session) => <Text.Helper as="span">{formatDate(session.createdAt)}</Text.Helper>,
    },
    {
      key: "updated",
      label: "Активность",
      width: "2fr",
      render: (session) => <Text.Helper as="span">{formatDate(session.updatedAt)}</Text.Helper>,
    },
  ],
}

type UserSessionsTileProps = {
  userId: string
}

export function UserSessionsTile({ userId }: UserSessionsTileProps) {
  const { data: sessions, isLoading, error } = useAdminUserSessions(userId)
  const deleteMutation = useDeleteAdminUserSessions(userId)
  const deleteAllMutation = useDeleteAllAdminUserSessions(userId)

  const [selected, setSelected] = useState<StructuredListKey[]>([])

  const handleSelected = useCallback((keys: StructuredListKey[]) => {
    setSelected(keys)
  }, [])

  const handleDeleteSelected = () => {
    if (selected.length === 0) return
    deleteMutation.mutate(selected as string[], {
      onSuccess: () => setSelected([]),
    })
  }

  const handleDeleteAll = () => {
    if (!sessions?.length) return
    deleteAllMutation.mutate(undefined, {
      onSuccess: () => setSelected([]),
    })
  }

  const isBusy = deleteMutation.isPending || deleteAllMutation.isPending
  const hasSessions = (sessions?.length ?? 0) > 0

  return (
    <Tile as="section">
      <Stack gap={3}>
        <Text.Heading as="p" variant="compact-01">
          Активные сессии
        </Text.Heading>

        <Stack orientation="horizontal" gap={2} className="flex-wrap items-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            label={deleteMutation.isPending ? "Очистка..." : "Очистить"}
            disabled={selected.length === 0 || isBusy}
            onClick={handleDeleteSelected}
          />
          <Button
            type="button"
            size="sm"
            variant="danger-tertiary"
            label={deleteAllMutation.isPending ? "Очистка..." : "Очистить все"}
            disabled={!hasSessions || isBusy}
            onClick={handleDeleteAll}
          />
        </Stack>

        {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
        {error && <Text.Helper as="p">Ошибка: {error.message}</Text.Helper>}
        {!isLoading && !error && !hasSessions && (
          <Text.Helper as="p">Нет активных сессий</Text.Helper>
        )}
        {hasSessions && sessions && (
          <StructuredList
            definition={sessionListDefinition}
            items={sessions}
            selected={selected}
            onSelected={handleSelected}
            multiselect
            condensed
            overflow={8}
            disabled={isBusy}
          />
        )}

        <InlineMutationNotification mutation={deleteMutation} successMessage="Сессии удалены" />
        <InlineMutationNotification mutation={deleteAllMutation} successMessage="Все сессии удалены" />
      </Stack>
    </Tile>
  )
}
