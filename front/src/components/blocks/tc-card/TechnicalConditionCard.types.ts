import type { Stored, TechnicalCondition } from '@miracle/types';

export type TechnicalConditionCardProps = {
    technicalCondition: Stored<TechnicalCondition>;
    onTechnicalConditionSaved?: (saved: Stored<TechnicalCondition>) => void;
};
