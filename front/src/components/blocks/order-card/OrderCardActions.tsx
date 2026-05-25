import { useMemo } from 'react';
import { Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/modal-dialog';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useDialog } from '@/lib/hooks/use-dialog';
import { useAnalyseOrderDetails, useCanAnalyseOrderDetails } from '@/lib/queries/order.query';
import { useOrderCardContext } from './OrderCard';
import { AnalyseDesignationModal } from './AnalyseDesignationModal';

export function OrderCardActions() {
    const { order, isSaving, save, saveError } = useOrderCardContext();
    const { isDirtyAnywhere } = useGuardState();
    const { open } = useDialog();

    const details = useMemo(() => order?.details, [order?.id]);

    const analyseDetailsMutation = useAnalyseOrderDetails(order?.id);
    const analyseAvailabilityQuery = useCanAnalyseOrderDetails(order?.id);

    const availability = analyseAvailabilityQuery.data;
    const hasExistingAnalysis = details != null;
    const canAnalyseFirst = !isDirtyAnywhere && availability?.canAnalyse === true;
    const canForceReanalyse = !isDirtyAnywhere && availability?.canForceReanalyse === true;
    const canRunAnalyse = canAnalyseFirst || canForceReanalyse;

    const analyseDisabledMessage = isDirtyAnywhere
        ? 'Сохраните изменения перед запуском анализа'
        : !canRunAnalyse
            ? availability?.errorMessage
            : undefined;

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

    const handleAnalyseClick = () => {
        if (hasExistingAnalysis) {
            open(({ close }) => (
                <Dialog
                    label="Анализ заявки"
                    title="Запустить вывод требований заново?"
                    size="sm"
                    onClose={close}
                    actions={[
                        { label: 'Отмена', onClick: close, variant: 'secondary' },
                        {
                            label: 'Вывести заново',
                            onClick: () => {
                                analyseDetailsMutation.mutate({ forceReanalyse: true });
                                close();
                            },
                        },
                    ]}
                >
                    <Text as="p" compact className="text-muted-foreground">
                        Текущие результаты анализа заявки (требования, тип продукции и др.) будут удалены,
                        после чего запустится новый вывод.
                    </Text>
                </Dialog>
            ));
            return;
        }

        analyseDetailsMutation.mutate({ forceReanalyse: false });
    };

    const handleAnalyseDesignationClick = () => {
        if (!order?.id) {
            return;
        }
        open(({ close }) => (
            <AnalyseDesignationModal
                defaultOrderId={order.id}
                onClose={close}
            />
        ));
    };

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
                        disabled={!canRunAnalyse || analyseAvailabilityQuery.isFetching || analyseDetailsMutation.isPending}
                        onClick={handleAnalyseClick}
                    />
                </Stack>

                <Stack gap={2}>
                    <Button
                        variant="tertiary"
                        size="sm"
                        label="Анализ заказа"
                        disabled={!canAnalyseDesignation}
                        onClick={handleAnalyseDesignationClick}
                    />
                </Stack>
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
            </Stack>
        </Stack>
    );
}
