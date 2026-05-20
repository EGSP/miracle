import { useState } from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { DesignationSlot, Stored, TechnicalCondition } from '@miracle/types';
import { Textarea } from '@/components/ui/textarea';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function formatSlotsJson(slots: DesignationSlot[]): string {
    return JSON.stringify(slots, null, 2);
}

export function TechnicalConditionCardSlotsSection() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;
    const [parseError, setParseError] = useState<string | null>(null);

    const slotsJson = useField(`tc-${tc.id}-slots-json`, formatSlotsJson(tc.designationSlots ?? []));

    useContribute(contribute, `tc-${tc.id}-slots`, (draft): Stored<TechnicalCondition> | undefined => {
        try {
            const parsed = JSON.parse(slotsJson.value) as unknown;
            if (!Array.isArray(parsed)) {
                setParseError('designationSlots: ожидается JSON-массив');
                return undefined;
            }
            setParseError(null);
            return { ...draft, designationSlots: parsed as DesignationSlot[] };
        } catch {
            setParseError('designationSlots: невалидный JSON');
            return undefined;
        }
    });

    return (
        <Stack gap={1}>
            <Text.Label as="span" className="font-medium">
                designationSlots (JSON)
            </Text.Label>
            <Textarea
                size="md"
                className="font-mono text-xs"
                value={slotsJson.value}
                onChange={slotsJson.onInputChange}
                disabled={isSaving}
                aria-label="Слоты обозначения в формате JSON"
            />
            {parseError && (
                <Text as="span" compact className="text-destructive">
                    {parseError}
                </Text>
            )}
        </Stack>
    );
}
