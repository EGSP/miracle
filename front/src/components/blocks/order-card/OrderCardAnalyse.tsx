import { Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { useAnalyseOrderDetails, useCanAnalyseOrderDetails } from '@/lib/queries/order.query';

type OrderCardAnalyseProps = {
    orderId: string;
    hasUnsavedChanges: boolean;
};

export function OrderCardAnalyse({ orderId, hasUnsavedChanges }: OrderCardAnalyseProps) {
    const analyseDetailsMutation = useAnalyseOrderDetails(orderId);
    const analyseAvailabilityQuery = useCanAnalyseOrderDetails(orderId);
    const canAnalyse = !hasUnsavedChanges && analyseAvailabilityQuery.data?.canAnalyse === true;
    const analyseDisabledMessage = hasUnsavedChanges
        ? 'Сохраните изменения перед запуском анализа'
        : analyseAvailabilityQuery.data?.errorMessage;

    return (
        <Stack gap={2} className="border border-border p-3">
            <Text.Heading as="h4" variant="compact-01">
                Анализ
            </Text.Heading>
            <div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!canAnalyse || analyseAvailabilityQuery.isFetching || analyseDetailsMutation.isPending}
                    onClick={() => analyseDetailsMutation.mutate()}
                >
                    {analyseDetailsMutation.isPending
                        ? 'Запуск...'
                        : analyseAvailabilityQuery.isFetching
                            ? 'Проверка...'
                            : 'Вывести требования'}
                </Button>
            </div>
            {analyseAvailabilityQuery.isError ? (
                <Text as="p" compact className="text-destructive">
                    Ошибка проверки анализа: {getApiErrorMessage(analyseAvailabilityQuery.error)}
                </Text>
            ) : null}
            {!analyseAvailabilityQuery.isError && analyseDisabledMessage ? (
                <Text as="p" compact className="text-muted-foreground">
                    {analyseDisabledMessage}
                </Text>
            ) : null}
            {analyseDetailsMutation.isError ? (
                <Text as="p" compact className="text-destructive">
                    {getApiErrorMessage(analyseDetailsMutation.error)}
                </Text>
            ) : null}
            {analyseDetailsMutation.isSuccess ? (
                <Text as="p" compact className="text-muted-foreground">
                    Воркер запущен
                </Text>
            ) : null}
        </Stack>
    );
}
