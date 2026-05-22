import { Column, Grid, Stack, Text } from '@miracle/aramid';
import type { Stored, TechnicalCondition, TechnicalConditionRule } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrayEditor } from '@/components/ui/array-editor';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { createUuid } from '@/lib/uuid';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function makeRule(): TechnicalConditionRule {
    return { id: createUuid(), title: '', content: '' };
}

export function TCCRules() {
    const { technicalCondition, contribute, isSaving, rules } = useTechnicalConditionCardContext();
    const tc = technicalCondition;

    const update = (i: number, patch: Partial<TechnicalConditionRule>) =>
        rules.onChange(rules.value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    useContribute(contribute, `tc-${tc.id}-rules`, (draft): Stored<TechnicalCondition> => ({
        ...draft,
        rules: rules.value,
    }));

    return (
        <>
            <Text.Heading as="p" variant='02'>
                Правила
            </Text.Heading>
            <ArrayEditor
                items={rules.value}
                onAdd={() => rules.onChange([...rules.value, makeRule()])}
                onRemove={(i) => rules.onChange(rules.value.filter((_, idx) => idx !== i))}
                renderItem={(rule, i) => (
                    <Stack gap={1}>
                        <Input
                            label="Заголовок"
                            placeholder="Напр. 5.3 Климатическое исполнение"
                            value={rule.title ?? ''}
                            onChange={(e) => update(i, { title: e.target.value })}
                            disabled={isSaving}
                            full
                        />
                        <div className="flex flex-col gap-0.5">
                            <Textarea
                                label='Текст правила'
                                size="md"
                                placeholder="Таблицы хранятся как markdown-таблицы"
                                value={rule.content}
                                onChange={(e) => update(i, { content: e.target.value })}
                                disabled={isSaving}
                                resizable={true}
                                full
                            />
                        </div>
                    </Stack>
                )}
                addLabel="Добавить правило"
                disabled={isSaving}
            />
        </>
    );
}
