import { Column, Grid, Stack, Text } from '@miracle/aramid';
import type { Dual, Order, OrderDetails, OrderRequirement, Stored } from '@miracle/types';
import { useOrderCardContext } from './OrderCard';
import { useMemo } from 'react';



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

export function OrderCardDetails() {
    const { order } = useOrderCardContext();
    const details = useMemo(() => order?.details, [order?.id]);

    const requirements = useMemo(() => {
        if (!details || !details.requirements) return [];
        return details.requirements;
    }, [details])

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

        </Stack>
    );
}
