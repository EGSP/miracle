import { Stack, Text } from "@miracle/aramid"
import type { Stored, TechnicalCondition } from "@miracle/types"
import type * as React from "react"
import { Tile } from "@/components/ui/ds/tile"
import { DirtyGuardProvider, useGuardActions } from "@/contexts/dirty-state/DirtyGuardContext"
import { useDraft } from "@/contexts/draft-api/DraftContext"
import {
  useDeleteTechnicalCondition,
  useReplaceTechnicalCondition,
} from "@/lib/queries/technical-condition.query"
import { TCCActions } from "./TCCActions"
import { TCCInfo } from "./TCCInfo"
import { TCCSlotRules } from "./TCCSlotRules"
import { TCCTemplates } from "./TCCTemplates"
import type { TechnicalConditionCardProps } from "./TechnicalConditionCard.types"
import {
  TechnicalConditionCardContextProvider,
  type TechnicalConditionCardContextType,
  useTechnicalConditionCardContext,
} from "./TechnicalConditionCardContext"

export { useTechnicalConditionCardContext } from "./TechnicalConditionCardContext"

type ProviderProps = React.PropsWithChildren<TechnicalConditionCardProps>

function TechnicalConditionCardProvider({
  technicalCondition,
  onTechnicalConditionSaved,
  onTechnicalConditionDeleted,
  children,
}: ProviderProps) {
  const draft = useDraft<Stored<TechnicalCondition>>()
  const { commitAll } = useGuardActions()
  const mutation = useReplaceTechnicalCondition(technicalCondition.id)
  const deleteMutation = useDeleteTechnicalCondition(technicalCondition.id)

  const save = () => {
    const merged = draft.collect({ ...technicalCondition })
    if (!merged) {
      return
    }
    const body: TechnicalCondition = {
      name: merged.name,
      fileId: merged.fileId,
      productTypeId: merged.productTypeId,
      lastProductTypeName: merged.lastProductTypeName,
      slotRules: merged.slotRules ?? [],
      designationDecodeExamples: merged.designationDecodeExamples,
      displayTemplates: merged.displayTemplates ?? [],
    }

    mutation.mutate(body, {
      onSuccess: (saved) => {
        commitAll()
        onTechnicalConditionSaved?.(saved)
      },
    })
  }

  const deleteTc = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: (deleted) => onTechnicalConditionDeleted?.(deleted),
    })
  }

  const value: TechnicalConditionCardContextType = {
    technicalCondition,
    isSaving: mutation.isPending,
    saveError: mutation.error ?? null,
    save,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error ?? null,
    deleteTc,
    ...draft,
  }

  return (
    <TechnicalConditionCardContextProvider value={value}>
      {children}
    </TechnicalConditionCardContextProvider>
  )
}

function TechnicalConditionCardBody() {
  const { technicalCondition } = useTechnicalConditionCardContext()

  return (
    <Tile as="section">
      <Stack gap={5}>
        <Text.Heading as="p" variant="03">
          Техническое условие{" "}
          <Text as="span" expressive>
            ({technicalCondition.id})
          </Text>
        </Text.Heading>
        <TCCActions />
        <TCCInfo />
        <TCCSlotRules />
        <TCCTemplates />
      </Stack>
    </Tile>
  )
}

export function TechnicalConditionCard(props: TechnicalConditionCardProps) {
  const { technicalCondition } = props
  return (
    <DirtyGuardProvider
      id={`tc-card-${technicalCondition.id}`}
      key={`${technicalCondition.id}-${technicalCondition.updatedAt}`}
    >
      <TechnicalConditionCardProvider {...props}>
        <TechnicalConditionCardBody />
      </TechnicalConditionCardProvider>
    </DirtyGuardProvider>
  )
}
