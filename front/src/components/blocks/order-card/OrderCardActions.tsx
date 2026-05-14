import { useMemo } from 'react';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useAnalyseOrderDetails, useCanAnalyseOrderDetails, useClearAnalysedDetails } from '@/lib/queries/order.query';
import { useOrderCardContext } from './OrderCard';

export function OrderCardActions() {
    const { order, isSaving, save, saveError } = useOrderCardContext();
    const { isDirtyAnywhere } = useGuardState();

    const details = useMemo(() => order?.details, [order?.id]);

    const analyseDetailsMutation = useAnalyseOrderDetails(order?.id);
    const analyseAvailabilityQuery = useCanAnalyseOrderDetails(order?.id);
    const clearDetailsMutation = useClearAnalysedDetails(order?.id);

    const canAnalyse =
        !isDirtyAnywhere
        && !details
        && analyseAvailabilityQuery.data?.canAnalyse === true;

    const analyseDisabledMessage = isDirtyAnywhere
        ? 'Сохраните изменения перед запуском анализа'
        : details
            ? 'Сначала очистите детали заказа, чтобы запустить анализ снова'
            : analyseAvailabilityQuery.data?.errorMessage;

    return (
        <Grid fullWidth withRowGap>
            <Column span={8}>
                <Stack gap={2}>
                    <Stack orientation="horizontal" gap={2} className="items-center">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!isDirtyAnywhere || isSaving}
                            onClick={save}
                        >
                            {isSaving ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                        {isDirtyAnywhere && (
                            <Text as="span" compact className="text-muted-foreground">
                                есть изменения
                            </Text>
                        )}
                    </Stack>
                    <InlineMutationNotification
                        mutation={{ isError: saveError !== null, isSuccess: false, error: saveError }}
                    />
                </Stack>
            </Column>

            <Column span={8}>
                <Stack gap={2}>
                    <Stack orientation="horizontal" gap={2}>
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
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!details || clearDetailsMutation.isPending}
                            onClick={() => clearDetailsMutation.mutate()}
                        >
                            {clearDetailsMutation.isPending ? 'Очистка...' : 'Очистить анализ'}
                        </Button>
                    </Stack>
                    {analyseDisabledMessage && !analyseAvailabilityQuery.isError && (
                        <Text as="p" compact className="text-muted-foreground">
                            {analyseDisabledMessage}
                        </Text>
                    )}
                    <InlineMutationNotification
                        mutation={{ isError: analyseAvailabilityQuery.isError, isSuccess: false, error: analyseAvailabilityQuery.error }}
                    />
                    <InlineMutationNotification
                        mutation={analyseDetailsMutation}
                        successMessage="Воркер запущен"
                    />
                    <InlineMutationNotification mutation={clearDetailsMutation} />
                </Stack>
            </Column>
        </Grid>
    );
}
