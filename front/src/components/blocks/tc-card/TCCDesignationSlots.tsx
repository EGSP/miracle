import { Column, Grid, Stack, Text } from '@miracle/aramid';
import type { DesignationSlot, Stored, TechnicalCondition, TechnicalConditionRule } from '@miracle/types';
import { Input } from '@/components/ui/input';
import { ArrayEditor } from '@/components/ui/array-editor';
import { useContribute } from '@/contexts/draft-api/DraftContext';
import { useField } from '@/contexts/dirty-state/useField';
import { useTechnicalConditionCardContext } from './TechnicalConditionCardContext';

function makeSlot(index: number): DesignationSlot {
    return { index, name: '', ruleIds: [] };
}

function ruleLabel(rule: TechnicalConditionRule | null, orphanId?: string): string {
    if (rule) {
        const title = rule.title?.trim();
        return title || rule.id;
    }
    if (orphanId) {
        return `Неизвестное правило (${orphanId})`;
    }
    return 'Правило не выбрано';
}

export function TCCDesignationSlots() {
    const { technicalCondition, contribute, isSaving, rules } = useTechnicalConditionCardContext();
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
        <>
            <Text.Heading as="p" variant="02">
                Параметры условного обозначения
            </Text.Heading>
            <ArrayEditor
                items={slots.value}
                onAdd={() => slots.onChange([...slots.value, makeSlot(slots.value.length)])}
                onRemove={(i) => slots.onChange(slots.value.filter((_, idx) => idx !== i))}
                renderItem={(slot, i) => (
                    <Stack gap={1}>
                        <Input
                            label={`${i + 1} Название параметра`}
                            placeholder="Напр. Климатическое исполнение"
                            value={slot.name}
                            onChange={(e) => update(i, { name: e.target.value })}
                            disabled={isSaving}
                        />
                        <div className="flex flex-col gap-0.5">
                            <Text.Helper as="span">Ссылки на правила определения значения параметра</Text.Helper>
                            <ArrayEditor
                                items={slot.ruleIds}
                                onAdd={() => update(i, { ruleIds: [...slot.ruleIds, ''] })}
                                onRemove={(j) =>
                                    update(i, { ruleIds: slot.ruleIds.filter((_, idx) => idx !== j) })
                                }
                                renderItem={(ruleId, j) => {
                                    const selectedRule =
                                        rules.value.find((r) => r.id === ruleId) ?? null;

                                    return (
                                        <div className="flex flex-col gap-0.5">
                                            <Text.Helper as="span">{`Правило ${j + 1}`}</Text.Helper>
                                            <Input.Dropdown<TechnicalConditionRule>
                                                items={rules.value}
                                                value={selectedRule}
                                                onChange={(next) =>
                                                    updateRuleId(i, j, next?.id ?? '')
                                                }
                                                getItemKey={(item) => item.id}
                                                disabled={isSaving}
                                                renderSelectedItem={(item) => (
                                                    <Text as="span" compact>
                                                        {ruleLabel(item, ruleId || undefined)}
                                                    </Text>
                                                )}
                                                renderListItem={(item) => (
                                                    <Text as="span" compact>
                                                        {ruleLabel(item)}
                                                    </Text>
                                                )}
                                            >
                                                <Input.Dropdown.Selected />
                                                <Input.Dropdown.List emptyText="Нет правил — добавьте в разделе «Правила»" />
                                            </Input.Dropdown>
                                        </div>
                                    );
                                }}
                                addLabel="Добавить ссылку"
                                disabled={isSaving}
                            />
                        </div>
                    </Stack>
                )}
                addLabel="Добавить параметр"
                disabled={isSaving}
            />
        </>
    );
}
