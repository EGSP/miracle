import { useMemo } from 'react';
import { Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { getApiErrorMessage } from '@/lib/api';
import { useAnalyseOrderDetails, useCanAnalyseOrderDetails } from '@/lib/queries/order.query';
import { useOrderCardContext } from './OrderCard';

const detailsBlockMessage = 'Сначала очистите детали заказа, чтобы запустить анализ снова';

export function OrderCardAnalyse() {
    const { order } = useOrderCardContext();
    const { isDirtyAnywhere } = useGuardState();
    const details = useMemo(() => order?.details, [order?.id]);

    const analyseDetailsMutation = useAnalyseOrderDetails(order?.id);
    const analyseAvailabilityQuery = useCanAnalyseOrderDetails(order?.id);

    const canAnalyse =
        !isDirtyAnywhere
        && !details
        && analyseAvailabilityQuery.data?.canAnalyse === true;

    const analyseDisabledMessage = isDirtyAnywhere
        ? 'Сохраните изменения перед запуском анализа'
        : details
            ? detailsBlockMessage
            : analyseAvailabilityQuery.data?.errorMessage;

    return (
        <Stack gap={2} className="border border-border p-3">
            <Text.Heading as="h4" variant="compact-01">Анализ</Text.Heading>
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
            {analyseAvailabilityQuery.isError && (
                <Text as="p" compact className="text-destructive">
                    Ошибка проверки анализа: {getApiErrorMessage(analyseAvailabilityQuery.error)}
                </Text>
            )}
            {!analyseAvailabilityQuery.isError && analyseDisabledMessage && (
                <Text as="p" compact className="text-muted-foreground">
                    {analyseDisabledMessage}
                </Text>
            )}
            {analyseDetailsMutation.isError && (
                <Text as="p" compact className="text-destructive">
                    {getApiErrorMessage(analyseDetailsMutation.error)}
                </Text>
            )}
            {analyseDetailsMutation.isSuccess && (
                <Text as="p" compact className="text-muted-foreground">
                    Воркер запущен
                </Text>
            )}
        </Stack>
    );
}
