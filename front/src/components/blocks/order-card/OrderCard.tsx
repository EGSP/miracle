import * as React from 'react';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { FileCard } from '@/components/blocks/FileCard';
import { DirtyProvider, useDirtyStore } from '@/contexts/dirty-state/DirtyStateContext';
import { getApiErrorMessage } from '@/lib/api';
import { useUpdateOrder } from '@/lib/queries/order.query';
import { OrderCardAnalyse } from './OrderCardAnalyse';
import { OrderCardDetails } from './OrderCardDetails';
import { OrderCardFile } from './OrderCardFile';
import { OrderCardInfo } from './OrderCardInfo';
import type { OrderCardDirtyState, OrderCardProps } from './OrderCard.types';

function OrderCardBody({ order, files, onOrderSaved }: OrderCardProps) {
    const isDirty = useDirtyStore<OrderCardDirtyState, boolean>((s) => s.isDirty);
    const workingCopyFileId = useDirtyStore<OrderCardDirtyState, string | undefined>((s) => s.workingCopy.fileId);
    const commit = useDirtyStore<OrderCardDirtyState, () => void>((s) => s.commit);

    const updateOrderMutation = useUpdateOrder();

    const selectedFile = React.useMemo(
        () => files.find((f) => f.id === workingCopyFileId) ?? null,
        [files, workingCopyFileId],
    );
    const shouldShowFileCard = selectedFile?.meta?.available === true;

    const handleSave = () => {
        updateOrderMutation.mutate(
            { id: order.id, fileId: workingCopyFileId },
            {
                onSuccess: (updatedOrder) => {
                    commit();
                    onOrderSaved?.(updatedOrder);
                },
            },
        );
    };

    return (
        <Grid as="article" withRowGap className="border border-border">
            <Column span={16}>
                <Stack gap={2}>
                    <Stack orientation="horizontal" gap={2} className="items-center">
                        <Text.Heading as="h3" variant="compact-01">Карточка заказа</Text.Heading>
                        {isDirty && (
                            <Text as="span" compact className="text-muted-foreground">есть изменения</Text>
                        )}
                    </Stack>
                    <div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!isDirty || updateOrderMutation.isPending}
                            onClick={handleSave}
                        >
                            {updateOrderMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                    </div>
                </Stack>
            </Column>

            <Column span={16}><OrderCardInfo order={order} /></Column>
            <Column span={16}><OrderCardFile files={files} /></Column>

            {shouldShowFileCard && (
                <Column span={16}><FileCard file={selectedFile} /></Column>
            )}

            <Column span={16}>
                <OrderCardDetails order={order} />
            </Column>
            <Column span={16}>
                <OrderCardAnalyse order={order} />
            </Column>

            {updateOrderMutation.isError && (
                <Column span={16}>
                    <Text as="p" compact className="text-destructive">
                        Ошибка сохранения: {getApiErrorMessage(updateOrderMutation.error)}
                    </Text>
                </Column>
            )}
        </Grid>
    );
}

export function OrderCard({ order, files, onOrderSaved }: OrderCardProps) {
    return (
        <DirtyProvider<OrderCardDirtyState>
            id="order-card"
            initial={{ orderId: order.id, fileId: order.fileId ?? undefined }}
            key={order.id}
        >
            <OrderCardBody order={order} files={files} onOrderSaved={onOrderSaved} />
        </DirtyProvider>
    );
}
