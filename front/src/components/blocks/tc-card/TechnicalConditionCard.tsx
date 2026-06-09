import { Column, Grid, Layer, Stack, Text } from "@miracle/aramid"
import type { Stored, TechnicalCondition } from "@miracle/types"
import type * as React from "react"
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
    <Layer>
      <Grid withRowGap className="border border-border p-3">
        <Column span="100%">
          <Text.Heading as="p" variant="03">
            Техническое условие{" "}
            <Text as="span" expressive>
              ({technicalCondition.id})
            </Text>
          </Text.Heading>
        </Column>
        <Column span="100%">
          <TCCActions />
        </Column>
        <Column span="100%">
          <TCCInfo />
        </Column>
        <Column span="100%">
          <Stack gap={2}>
            <TCCSlotRules />
          </Stack>
        </Column>
        <Column span="100%">
          <TCCTemplates />
        </Column>
      </Grid>
    </Layer>
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
