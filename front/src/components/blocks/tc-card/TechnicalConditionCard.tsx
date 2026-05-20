import * as React from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { DirtyGuardProvider, useGuardActions } from '@/contexts/dirty-state/DirtyGuardContext';
import { useDraft } from '@/contexts/draft-api/DraftContext';
import { useReplaceTechnicalCondition } from '@/lib/queries/technical-condition.query';
import { TechnicalConditionCardActions } from './TechnicalConditionCardActions';
import {
    TechnicalConditionCardContextProvider,
    type TechnicalConditionCardContextType,
    useTechnicalConditionCardContext,
} from './TechnicalConditionCardContext';
import { TechnicalConditionCardMeta } from './TechnicalConditionCardMeta';
import { TechnicalConditionCardRulesSection } from './TechnicalConditionCardRulesSection';
import { TechnicalConditionCardSlotsSection } from './TechnicalConditionCardSlotsSection';
import { TechnicalConditionCardTemplatesSection } from './TechnicalConditionCardTemplatesSection';
import type { TechnicalConditionCardProps } from './TechnicalConditionCard.types';

export { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

type ProviderProps = React.PropsWithChildren<TechnicalConditionCardProps>;

function TechnicalConditionCardProvider({
    technicalCondition,
    onTechnicalConditionSaved,
    children,
}: ProviderProps) {
    const draft = useDraft<Stored<TechnicalCondition>>();
    const { commitAll } = useGuardActions();
    const mutation = useReplaceTechnicalCondition(technicalCondition.id);

    const save = () => {
        const merged = draft.collect({ ...technicalCondition });
        if (!merged) {
            return;
        }
        const body: TechnicalCondition = {
            fileId: merged.fileId,
            productTypeId: merged.productTypeId,
            rules: merged.rules,
            designationSlots: merged.designationSlots,
            displayTemplates: merged.displayTemplates,
        };

        mutation.mutate(body, {
            onSuccess: (saved) => {
                commitAll();
                onTechnicalConditionSaved?.(saved);
            },
        });
    };

    const value: TechnicalConditionCardContextType = {
        technicalCondition,
        isSaving: mutation.isPending,
        saveError: mutation.error ?? null,
        save,
        ...draft,
    };

    return (
        <TechnicalConditionCardContextProvider value={value}>
            {children}
        </TechnicalConditionCardContextProvider>
    );
}

function TechnicalConditionCardBody() {
    const { technicalCondition } = useTechnicalConditionCardContext();

    return (
        <Stack gap={3} className="border border-border bg-muted/10 p-3">
            <Text.Heading as="h4" variant="compact-01">
                ТУ <Text as="span" compact className="text-muted-foreground">({technicalCondition.id})</Text>
            </Text.Heading>
            <TechnicalConditionCardActions />
            <TechnicalConditionCardMeta />
            <TechnicalConditionCardRulesSection />
            <TechnicalConditionCardSlotsSection />
            <TechnicalConditionCardTemplatesSection />
        </Stack>
    );
}

export function TechnicalConditionCard(props: TechnicalConditionCardProps) {
    const { technicalCondition } = props;
    return (
        <DirtyGuardProvider
            id={`tc-card-${technicalCondition.id}`}
            key={`${technicalCondition.id}-${technicalCondition.updatedAt}`}
        >
            <TechnicalConditionCardProvider {...props}>
                <TechnicalConditionCardBody />
            </TechnicalConditionCardProvider>
        </DirtyGuardProvider>
    );
}
