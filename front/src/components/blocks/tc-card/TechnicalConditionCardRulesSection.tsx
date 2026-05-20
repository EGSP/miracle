import { useState } from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { Stored, TechnicalCondition, TechnicalConditionRule } from '@miracle/types';
import { Textarea } from '@/components/ui/textarea';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function formatRulesJson(rules: TechnicalConditionRule[]): string {
    return JSON.stringify(rules, null, 2);
}

export function TechnicalConditionCardRulesSection() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;
    const [parseError, setParseError] = useState<string | null>(null);

    const rulesJson = useField(`tc-${tc.id}-rules-json`, formatRulesJson(tc.rules ?? []));

    useContribute(contribute, `tc-${tc.id}-rules`, (draft): Stored<TechnicalCondition> | undefined => {
        try {
            const parsed = JSON.parse(rulesJson.value) as unknown;
            if (!Array.isArray(parsed)) {
                setParseError('rules: ожидается JSON-массив');
                return undefined;
            }
            setParseError(null);
            return { ...draft, rules: parsed as TechnicalConditionRule[] };
        } catch {
            setParseError('rules: невалидный JSON');
            return undefined;
        }
    });

    return (
        <Stack gap={1}>
            <Text.Label as="span" className="font-medium">
                rules (JSON)
            </Text.Label>
            <Textarea
                size="md"
                className="font-mono text-xs"
                value={rulesJson.value}
                onChange={rulesJson.onInputChange}
                disabled={isSaving}
                aria-label="Правила ТУ в формате JSON"
            />
            {parseError && (
                <Text as="span" compact className="text-destructive">
                    {parseError}
                </Text>
            )}
        </Stack>
    );
}
