import { createContext, useContext } from 'react';
import type { Stored, TechnicalCondition } from '@miracle/types';
import type { DraftAPI } from '@/contexts/draft-api/DraftContext';

export type TechnicalConditionCardContextType = {
    technicalCondition: Stored<TechnicalCondition>;
    isSaving: boolean;
    saveError: Error | null;
    save: () => void;
} & DraftAPI<Stored<TechnicalCondition>>;

const TechnicalConditionCardContext = createContext<TechnicalConditionCardContextType | null>(null);

export function useTechnicalConditionCardContext(): TechnicalConditionCardContextType {
    const ctx = useContext(TechnicalConditionCardContext);
    if (!ctx) {
        throw new Error('useTechnicalConditionCardContext must be used within TechnicalConditionCardProvider');
    }
    return ctx;
}

export const TechnicalConditionCardContextProvider = TechnicalConditionCardContext.Provider;
