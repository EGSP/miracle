import { useState } from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { DisplayTemplate, Stored, TechnicalCondition } from '@miracle/types';
import { Textarea } from '@/components/ui/textarea';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function formatTemplatesJson(templates: DisplayTemplate[]): string {
    return JSON.stringify(templates, null, 2);
}

export function TechnicalConditionCardTemplatesSection() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;
    const [parseError, setParseError] = useState<string | null>(null);

    const templatesJson = useField(`tc-${tc.id}-templates-json`, formatTemplatesJson(tc.displayTemplates));

    useContribute(contribute, `tc-${tc.id}-templates`, (draft: Stored<TechnicalCondition>) => {
        try {
            const parsed = JSON.parse(templatesJson.value) as unknown;
            if (!Array.isArray(parsed)) {
                setParseError('displayTemplates: ожидается JSON-массив');
                return undefined;
            }
            setParseError(null);
            return { ...draft, displayTemplates: parsed as DisplayTemplate[] };
        } catch {
            setParseError('displayTemplates: невалидный JSON');
            return undefined;
        }
    });

    return (
        <Stack gap={1}>
            <Text.Label as="span" className="font-medium">
                displayTemplates (JSON)
            </Text.Label>
            <Textarea
                size="md"
                className="font-mono text-xs"
                value={templatesJson.value}
                onChange={templatesJson.onInputChange}
                disabled={isSaving}
                aria-label="Шаблоны отображения в формате JSON"
            />
            {parseError && (
                <Text as="span" compact className="text-destructive">
                    {parseError}
                </Text>
            )}
        </Stack>
    );
}
