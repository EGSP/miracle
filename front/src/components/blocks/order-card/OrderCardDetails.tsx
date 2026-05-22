import { Column, Grid, Stack, Text } from '@miracle/aramid';
import type {
    Designation,
    DesignationSlot,
    DesignationValue,
    Dual,
    OrderRequirement,
} from '@miracle/types';
import { useOrderCardContext } from './OrderCard';
import { useMemo } from 'react';
import { useTechnicalCondition } from '@/lib/queries/technical-condition.query';



function OrderRequirementItem({ requirement }: { requirement: Dual<OrderRequirement> }) {

    return (
        <Grid condensed fullWidth>
            <Column span={8}>
                {requirement.ai ? (
                    <OrderRequirementHalf requirement={requirement.ai} label="AI" />
                ) : null}
            </Column>
            <Column span={8}>
                {requirement.human ? (
                    <OrderRequirementHalf requirement={requirement.human} label="Human" />
                ) : null}
            </Column>
        </Grid>
    );

    function OrderRequirementHalf({ requirement, label }: { requirement: OrderRequirement, label: 'AI' | 'Human' }) {
        return (
            <Stack gap={1}>
                <Stack orientation="horizontal" gap={3}>
                    <Text.Label as="span" expressive>{requirement.parameterName}</Text.Label>
                    <Text.Label as="span">{label}</Text.Label>
                </Stack>
                <Text.Code as="p">
                    {requirement.requiredValue}
                </Text.Code>
            </Stack>
        );
    }
}

/**
 * Блок «Условное обозначение». Источник данных:
 * - details.designation.human (если есть) — итог конструктора;
 * - иначе details.designation.ai — ответ DesignationWorker.
 *
 * Названия слотов и их порядок берутся из TC.designationSlots (резолвим по
 * designation.tcId). Если TC ещё не загружено или у слота нет соответствия в TC —
 * рендерим slotIndex.
 */
function DesignationSection({ designation }: { designation: Designation }) {
    const tcQuery = useTechnicalCondition(designation.tcId);
    const tcSlots: DesignationSlot[] = useMemo(
        () => tcQuery.data?.designationSlots ?? [],
        [tcQuery.data],
    );
    const slotByIndex = useMemo(
        () => new Map(tcSlots.map((s) => [s.index, s])),
        [tcSlots],
    );

    const orderedValues = useMemo(
        () => [...designation.values].sort((a, b) => a.slotIndex - b.slotIndex),
        [designation.values],
    );

    return (
        <Stack gap={2}>
            <Text.Heading as="h4" variant="compact-01">
                Условное обозначение
            </Text.Heading>
            {orderedValues.length === 0 ? (
                <Text.Label as="p" className="text-muted-foreground">
                    Нет значений
                </Text.Label>
            ) : (
                <Stack gap={3}>
                    {orderedValues.map((dv) => (
                        <DesignationValueRow
                            key={dv.slotIndex}
                            value={dv}
                            slotName={slotByIndex.get(dv.slotIndex)?.name}
                        />
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

function DesignationValueRow({
    value,
    slotName,
}: {
    value: DesignationValue;
    slotName?: string;
}) {
    const isLowConfidence = value.confidence < 0.7;
    const isUnknown = value.value === null;
    const confidencePct = Math.round(value.confidence * 100);

    return (
        <Stack gap={1} className={isLowConfidence ? 'border-l-2 border-amber-500 pl-2' : ''}>
            <Stack orientation="horizontal" gap={3}>
                <Text.Label as="span" expressive>
                    {`№${value.slotIndex}${slotName ? ` — ${slotName}` : ''}`}
                </Text.Label>
                <Text.Label as="span" className="text-muted-foreground">
                    {`${confidencePct}%`}
                </Text.Label>
            </Stack>
            {isUnknown ? (
                <Text.Label as="p" className="text-muted-foreground">
                    не определено
                </Text.Label>
            ) : (
                <Text.Code as="p">{value.value}</Text.Code>
            )}
            <Text.Helper as="p" className="text-muted-foreground">
                {value.reasoning}
            </Text.Helper>
        </Stack>
    );
}

export function OrderCardDetails() {
    const { order } = useOrderCardContext();
    const details = useMemo(() => order?.details, [order?.id]);

    const requirements = useMemo(() => {
        if (!details || !details.requirements) return [];
        return details.requirements;
    }, [details])

    const designation = useMemo(() => {
        return details?.designation?.human ?? details?.designation?.ai ?? null;
    }, [details?.designation]);

    if (!details || order === null)
        return null;

    return (
        <Stack gap={3} className="border border-border p-3">
            <Text.Heading as="h3" variant="compact-01">
                Детали заказа
            </Text.Heading>
            <Stack gap={2}>
                <Text.Heading as="h4" variant="compact-01">
                    Требования
                </Text.Heading>
                {requirements.length > 0 ? (
                    <Stack gap={5}>
                        {requirements.map((requirement, index) => (
                            requirement.ai || requirement.human ? (
                                <OrderRequirementItem
                                    key={`${order.id}-req-${index}`}
                                    requirement={requirement}
                                />
                            ) : null
                        ))}
                    </Stack>
                ) : (
                    <Text.Label as="p" className="text-muted-foreground">
                        Нет требований
                    </Text.Label>
                )}
            </Stack>

            {designation && <DesignationSection designation={designation} />}
        </Stack>
    );
}
