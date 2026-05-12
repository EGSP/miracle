import { Stack, Text } from '@miracle/aramid';
import type { OrderDetails, OrderRequirement } from '@miracle/types';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { useClearAnalysedDetails } from '@/lib/queries/order.query';

function AnalysedRequirementItem({ requirement }: { requirement: OrderRequirement }) {
    return (
        <Stack gap={1} className="border border-border p-2">
            <Text.Label as="span" className="text-muted-foreground">
                {requirement.parameterName}
            </Text.Label>
            <Text as="p" compact>
                {requirement.requiredValue}
            </Text>
        </Stack>
    );
}

type OrderCardDetailsProps = {
    orderId: string;
    analysedDetails?: OrderDetails | null;
    hasDetails: boolean;
};

export function OrderCardDetails({ orderId, analysedDetails, hasDetails }: OrderCardDetailsProps) {
    const clearAnalysedDetailsMutation = useClearAnalysedDetails(orderId);
    const requirements = analysedDetails?.requirements ?? [];

    if (!hasDetails) {
        return null;
    }

    return (
        <Stack gap={3} className="border border-border p-3">
            <Stack orientation="horizontal" gap={2} className="items-center justify-between">
                <Text.Heading as="h3" variant="compact-01">
                    Детали заказа
                </Text.Heading>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={clearAnalysedDetailsMutation.isPending}
                    onClick={() => clearAnalysedDetailsMutation.mutate()}
                >
                    {clearAnalysedDetailsMutation.isPending ? 'Очистка...' : 'Очистить анализ'}
                </Button>
            </Stack>
            <Stack gap={2}>
                <Text.Heading as="h4" variant="compact-01">
                    Требования
                </Text.Heading>
                {requirements.length > 0 ? (
                    <Stack gap={2}>
                        {requirements.map((requirement, index) => (
                            <AnalysedRequirementItem key={requirement.index ?? index} requirement={requirement} />
                        ))}
                    </Stack>
                ) : (
                    <Text.Label as="p" className="text-muted-foreground">
                        Нет требований
                    </Text.Label>
                )}
            </Stack>
            {clearAnalysedDetailsMutation.isError ? (
                <Text as="p" compact className="text-destructive">
                    Ошибка очистки анализа: {getApiErrorMessage(clearAnalysedDetailsMutation.error)}
                </Text>
            ) : null}
        </Stack>
    );
}
