import { Stack, Text } from '@miracle/aramid';
import type { DisplayTemplate, Stored, TechnicalCondition } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { ArrayEditor } from '@/components/ui/array-editor';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { createUuid } from '@/lib/uuid';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function makeTemplate(): DisplayTemplate {
    return { id: createUuid(), name: '', separator: '-', includedSlots: [] };
}

export function TCCTemplates() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;

    const templates = useField<DisplayTemplate[]>(
        `tc-${tc.id}-templates`,
        tc.displayTemplates ?? [],
    );

    const update = (i: number, patch: Partial<DisplayTemplate>) =>
        templates.onChange(templates.value.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

    const updateSlotIndex = (tmplIdx: number, slotIdx: number, raw: string) => {
        const n = parseInt(raw, 10);
        const tmpl = templates.value[tmplIdx];
        const next = tmpl.includedSlots.map((v, i) => (i === slotIdx ? (isNaN(n) ? v : n) : v));
        update(tmplIdx, { includedSlots: next });
    };

    useContribute(contribute, `tc-${tc.id}-templates`, (draft): Stored<TechnicalCondition> => ({
        ...draft,
        displayTemplates: templates.value,
    }));

    return (
        <Stack gap={1}>
            <Text.Heading as="p" variant="02">
                Шаблоны отображения
            </Text.Heading>
            <ArrayEditor
                items={templates.value}
                onAdd={() => templates.onChange([...templates.value, makeTemplate()])}
                onRemove={(i) => templates.onChange(templates.value.filter((_, idx) => idx !== i))}
                renderItem={(tmpl, i) => (
                    <Stack gap={1}>
                        <Input
                            label="Название"
                            placeholder="Напр. Полное"
                            value={tmpl.name}
                            onChange={(e) => update(i, { name: e.target.value })}
                            disabled={isSaving}
                        />
                        <Input
                            label="Разделитель"
                            placeholder="Напр. -"
                            value={tmpl.separator}
                            onChange={(e) => update(i, { separator: e.target.value })}
                            disabled={isSaving}
                        />
                        <div className="flex flex-col gap-0.5">
                            <Text.Helper as="span">Индексы слотов</Text.Helper>
                            <ArrayEditor
                                items={tmpl.includedSlots}
                                onAdd={() => update(i, { includedSlots: [...tmpl.includedSlots, 0] })}
                                onRemove={(j) =>
                                    update(i, {
                                        includedSlots: tmpl.includedSlots.filter((_, idx) => idx !== j),
                                    })
                                }
                                renderItem={(slotIndex, j) => (
                                    <Input
                                        type="number"
                                        label={`Слот ${j + 1}`}
                                        value={slotIndex}
                                        onChange={(e) => updateSlotIndex(i, j, e.target.value)}
                                        disabled={isSaving}
                                    />
                                )}
                                addLabel="Добавить индекс"
                                disabled={isSaving}
                            />
                        </div>
                    </Stack>
                )}
                addLabel="Добавить шаблон"
                disabled={isSaving}
            />
        </Stack>
    );
}
