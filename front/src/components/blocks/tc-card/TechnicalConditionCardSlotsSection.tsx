import { Stack, Text } from '@miracle/aramid';
import type { DesignationSlot, Stored, TechnicalCondition } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { ArrayEditor } from '@/components/ui/array-editor';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function makeSlot(index: number): DesignationSlot {
    return { index, name: '', ruleIds: [] };
}

export function TechnicalConditionCardSlotsSection() {
    const { technicalCondition, contribute, isSaving } = useTechnicalConditionCardContext();
    const tc = technicalCondition;

    const slots = useField<DesignationSlot[]>(`tc-${tc.id}-slots`, tc.designationSlots ?? []);

    const update = (i: number, patch: Partial<DesignationSlot>) =>
        slots.onChange(slots.value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

    const updateRuleId = (slotIdx: number, ruleIdx: number, value: string) => {
        const slot = slots.value[slotIdx];
        const next = slot.ruleIds.map((id, i) => (i === ruleIdx ? value : id));
        update(slotIdx, { ruleIds: next });
    };

    useContribute(contribute, `tc-${tc.id}-slots`, (draft): Stored<TechnicalCondition> => ({
        ...draft,
        designationSlots: slots.value.map((s, i) => ({ ...s, index: i })),
    }));

    return (
        <Stack gap={1}>
            <Text.Label as="span" className="font-medium">
                Слоты обозначения
            </Text.Label>
            <ArrayEditor
                items={slots.value}
                onAdd={() => slots.onChange([...slots.value, makeSlot(slots.value.length)])}
                onRemove={(i) => slots.onChange(slots.value.filter((_, idx) => idx !== i))}
                renderItem={(slot, i) => (
                    <Stack gap={1}>
                        <Input
                            label="Название параметра"
                            placeholder="Напр. Климатическое исполнение"
                            value={slot.name}
                            onChange={(e) => update(i, { name: e.target.value })}
                            disabled={isSaving}
                        />
                        <div className="flex flex-col gap-0.5">
                            <Text.Helper as="span">ID правил</Text.Helper>
                            <ArrayEditor
                                items={slot.ruleIds}
                                onAdd={() => update(i, { ruleIds: [...slot.ruleIds, ''] })}
                                onRemove={(j) =>
                                    update(i, { ruleIds: slot.ruleIds.filter((_, idx) => idx !== j) })
                                }
                                renderItem={(ruleId, j) => (
                                    <Input
                                        label={`Правило ${j + 1}`}
                                        placeholder="UUID правила"
                                        value={ruleId}
                                        onChange={(e) => updateRuleId(i, j, e.target.value)}
                                        disabled={isSaving}
                                    />
                                )}
                                addLabel="Добавить ID"
                                disabled={isSaving}
                            />
                        </div>
                    </Stack>
                )}
                addLabel="Добавить слот"
                disabled={isSaving}
            />
        </Stack>
    );
}
