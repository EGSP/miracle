import { useMemo } from 'react';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useAnalyseOrderDetails, useCanAnalyseOrderDetails, useClearAnalysedDetails } from '@/lib/queries/order.query';
import { useOrderCardContext } from './OrderCard';
import { AnalyseDesignationDialog } from './AnalyseDesignationDialog';

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

    // Кнопка анализа условного обозначения доступна, когда у заказа есть хотя бы одно
    // активное требование (human или ai с used !== false). Это совпадает с логикой
    // валидации на бэке (см. analyseDesignation в order.router.ts).
    const hasEffectiveRequirement = useMemo(() => {
        return (details?.requirements ?? []).some(
            (dual) => dual.human !== undefined || (dual.ai !== undefined && dual.ai.used !== false),
        );
    }, [details?.requirements]);

    const canAnalyseDesignation = !isDirtyAnywhere && hasEffectiveRequirement && !!order?.id;
    const analyseDesignationDisabledMessage = isDirtyAnywhere
        ? 'Сохраните изменения перед запуском анализа обозначения'
        : !hasEffectiveRequirement
            ? 'Сначала выведите требования заказа'
            : undefined;

    return (
        <Stack gap={6} orientation='vertical'>
            <Stack gap={6} orientation='horizontal'>
                <Stack gap={2} className="items-center">
                    <Button
                        variant="tertiary"
                        size="sm"
                        label={isSaving ? 'Сохранение...' : 'Сохранить'}
                        disabled={!isDirtyAnywhere || isSaving}
                        onClick={save}
                    />
                    {isDirtyAnywhere && (
                        <Text as="span" compact className="text-muted-foreground">
                            есть изменения
                        </Text>
                    )}
                </Stack>

                <Stack gap={2}>
                    <Button
                        variant="tertiary"
                        size="sm"
                        label={
                            analyseDetailsMutation.isPending
                                ? 'Запуск...'
                                : analyseAvailabilityQuery.isFetching
                                    ? 'Проверка...'
                                    : 'Вывести требования'
                        }
                        disabled={!canAnalyse || analyseAvailabilityQuery.isFetching || analyseDetailsMutation.isPending}
                        onClick={() => analyseDetailsMutation.mutate()}
                    />
                    <Button
                        variant="tertiary"
                        size="sm"
                        label={clearDetailsMutation.isPending ? 'Очистка...' : 'Очистить анализ'}
                        disabled={!details || clearDetailsMutation.isPending}
                        onClick={() => clearDetailsMutation.mutate()}
                    />
                </Stack>

                {order?.id && (
                    <Stack gap={2}>
                        <AnalyseDesignationDialog
                            orderId={order.id}
                            trigger={
                                <Button
                                    variant="tertiary"
                                    size="sm"
                                    label="Анализ заказа"
                                    disabled={!canAnalyseDesignation}
                                />
                            }
                        />
                    </Stack>
                )}
            </Stack>
            <Stack gap={2} orientation='vertical'>
                {analyseDisabledMessage && !analyseAvailabilityQuery.isError && (
                    <Text as="p" compact className="text-muted-foreground">
                        {analyseDisabledMessage}
                    </Text>
                )}
                {analyseDesignationDisabledMessage && (
                    <Text as="p" compact className="text-muted-foreground">
                        {analyseDesignationDisabledMessage}
                    </Text>
                )}
                <InlineMutationNotification
                    mutation={{ isError: saveError !== null, isSuccess: false, error: saveError }}
                />
                <InlineMutationNotification
                    mutation={{ isError: analyseAvailabilityQuery.isError, isSuccess: false, error: analyseAvailabilityQuery.error }}
                />
                <InlineMutationNotification
                    mutation={analyseDetailsMutation}
                    successMessage="Воркер запущен"
                />
                <InlineMutationNotification mutation={clearDetailsMutation} />
            </Stack>
        </Stack>
    );
}
