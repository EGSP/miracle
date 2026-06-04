import type { Stored, TechnicalCondition } from "@miracle/types"

export type TechnicalConditionCardProps = {
  technicalCondition: Stored<TechnicalCondition>
  onTechnicalConditionSaved?: (saved: Stored<TechnicalCondition>) => void
  onTechnicalConditionDeleted?: (deleted: Stored<TechnicalCondition>) => void
}
