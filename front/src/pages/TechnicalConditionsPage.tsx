import { Column, Grid, Stack, Text } from "@miracle/aramid"
import type { Stored, TechnicalCondition } from "@miracle/types"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CreateTechnicalConditionDialog } from "@/components/blocks/tc-card/CreateTechnicalConditionDialog"
import { TechnicalConditionCard } from "@/components/blocks/tc-card/TechnicalConditionCard"
import {
  type ListDefinition,
  StructuredList,
  type StructuredListKey,
} from "@/components/ui/ds/structured-list"
import { DirtyGuardProvider, useGuardState } from "@/contexts/dirty-state/DirtyGuardContext"
import { useTechnicalConditions } from "@/lib/queries/technical-condition.query"

const COL_CARD = "75%" as const
const COL_LIST = "25%" as const

const tcListDefinition: ListDefinition<Stored<TechnicalCondition>> = {
  getKey: (tc) => tc.id,
  columns: [
    {
      key: "info",
      width: "1fr",
      rows: [
        {
          key: "name",
          label: "Название",
          weight: "1fr",
          render: (tc) => (
            <Text.Label as="span" expressive>
              {tc.name ?? "Без названия"}
            </Text.Label>
          ),
        },
        {
          key: "type",
          label: "Тип продукции",
          weight: "1fr",
          render: (tc) => (
            <Text.Helper as="span">
              {tc.lastProductTypeName ?? "Без типа продукции"}
            </Text.Helper>
          ),
        },
      ],
    },
  ],
}

function TechnicalConditionsPageContent() {
  const { tcId: tcIdParam } = useSearch({ from: "/technical-conditions" })
  const navigate = useNavigate({ from: "/technical-conditions" })
  const { isDirtyAnywhere } = useGuardState()

  const { data: technicalConditions, isLoading, error } = useTechnicalConditions()

  const sortedTechnicalConditions = useMemo(() => {
    if (!technicalConditions) return undefined
    return [...technicalConditions].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "ru"),
    )
  }, [technicalConditions])

  const [selectedTc, setSelectedTc] = useState<Stored<TechnicalCondition> | null>(null)

  const selected: StructuredListKey[] = selectedTc ? [selectedTc.id] : []

  const handleSelected = useCallback(
    (keys: StructuredListKey[]) => {
      if (isDirtyAnywhere) return
      const next = technicalConditions?.find((tc) => tc.id === keys[0]) ?? null
      setSelectedTc(next)
      void navigate({ search: (prev) => ({ ...prev, tcId: next?.id }) })
    },
    [isDirtyAnywhere, technicalConditions, navigate],
  )

  // Синхронизация URL-параметра с состоянием при загрузке списка
  useEffect(() => {
    if (!tcIdParam || !technicalConditions) return
    const match = technicalConditions.find((tc) => tc.id === tcIdParam)
    if (!match) return
    setSelectedTc((prev) => {
      if (prev?.id === match.id && prev.updatedAt === match.updatedAt) return prev
      return match
    })
  }, [tcIdParam, technicalConditions])

  return (
    <Grid as="main" fullWidth withRowGap>
      <Column span="100%">
        <Stack orientation="vertical" gap={3}>
          <Text.Heading as="h1" variant="02">
            Технические условия
          </Text.Heading>
          <CreateTechnicalConditionDialog />
        </Stack>
      </Column>

      <Column span={COL_LIST}>
        <Stack as="section" gap={3}>
          <Text.Heading as="h2" variant="compact-01">
            Список ТУ
          </Text.Heading>

          {isLoading && <Text.Label as="p">Загрузка…</Text.Label>}
          {error && (
            <Text as="p" compact>
              Ошибка: {error.message}
            </Text>
          )}
          {!isLoading && !error && sortedTechnicalConditions?.length === 0 && (
            <Text.Label as="p">
              Нет технических условий
            </Text.Label>
          )}
          {sortedTechnicalConditions && sortedTechnicalConditions.length > 0 && (
            <StructuredList
              definition={tcListDefinition}
              items={sortedTechnicalConditions}
              selected={selected}
              onSelected={handleSelected}
              fluid
              overflow={12}
            />
          )}
        </Stack>
      </Column>

      <Column span={COL_CARD}>
        {selectedTc ? (
          <TechnicalConditionCard
            key={selectedTc.id}
            technicalCondition={selectedTc}
            onTechnicalConditionSaved={(saved) => setSelectedTc(saved)}
            onTechnicalConditionDeleted={() => {
              setSelectedTc(null)
              void navigate({ search: (prev) => ({ ...prev, tcId: undefined }) })
            }}
          />
        ) : (
          <Stack className="border border-border p-4">
            <Text as="p" compact>
              Выберите техническое условие из списка справа.
            </Text>
          </Stack>
        )}
      </Column>
    </Grid>
  )
}

export default function TechnicalConditionsPage() {
  return (
    <DirtyGuardProvider confirmMessage="Есть несохраненные изменения. Смена ТУ недоступна.">
      <TechnicalConditionsPageContent />
    </DirtyGuardProvider>
  )
}
