import * as React from 'react';
import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta, Order, Stored } from '@miracle/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileCard } from '@/components/blocks/FileCard';
import { DirtyProvider, useDirtyStore, useField } from '@/contexts/dirty-state/DirtyStateContext';
import { getApiErrorMessage } from '@/lib/api';
import { useAnalyseOrderDetails, useUpdateOrder } from '@/lib/queries/order.query';
import { useGetUser } from '@/lib/queries/user.query';

type OrderCardProps = {
    order: Stored<Order>;
    files: FileWithMeta[];
    onOrderSaved?: (order: Stored<Order>) => void;
};

function formatCreatedAt(unixMs: number): string {
    return new Date(unixMs).toLocaleString();
}

type OrderCardDirtyState = {
    orderId: string;
    fileId?: string;
};

function getFileIndicator(file: FileWithMeta | null): { kind: 'succeeded' | 'failed' | 'unknown'; label: string } {
    if (!file) {
        return { kind: 'unknown', label: 'Файл не прикреплен' };
    }

    if (file.meta?.available === true) {
        return { kind: 'succeeded', label: 'Файл доступен' };
    }

    if (file.meta?.available === false) {
        return { kind: 'failed', label: 'Файл недоступен' };
    }

    return { kind: 'unknown', label: 'Статус файла неизвестен' };
}

function OrderCardInfo({ order }: { order: Stored<Order> }) {
    const { data: author } = useGetUser(order.authorId);

    return (
        <Stack gap={1}>
            <Text.Label as="span">ID заказа: {order.id}</Text.Label>
            <Text.Label as="span">Дата создания: {formatCreatedAt(order.createdAt)}</Text.Label>
            <Text.Label as="span">Автор: {author?.login ?? order.authorId}</Text.Label>
        </Stack>
    );
}

function OrderCardFile({ files }: { files: FileWithMeta[] }) {
    const fileField = useField<OrderCardDirtyState, 'fileId'>('fileId');
    const isDirty = useDirtyStore<OrderCardDirtyState, boolean>((state) => state.isDirty);

    const selectedFile = React.useMemo(
        () => files.find((file) => file.id === fileField.value) ?? null,
        [files, fileField.value]
    );

    return (
        <Stack gap={1}>
            <Stack orientation="horizontal" gap={2} className="items-center">
                <Text.Label as="span">Файл</Text.Label>
                {isDirty ? (
                    <Text as="span" compact className="text-muted-foreground">
                        (изменен)
                    </Text>
                ) : null}
            </Stack>
            <Input.Dropdown<FileWithMeta>
                items={files}
                value={selectedFile}
                onChange={(nextFile) => {
                    const nextFileId = nextFile?.id;
                    if (nextFileId === fileField.value) {
                        return;
                    }
                    fileField.onChange(nextFileId);
                }}
                getItemKey={(item) => item.id}
                renderSelectedItem={(item) => {
                    const indicator = getFileIndicator(item);

                    if (!item) {
                        return (
                            <Stack orientation="horizontal" gap={2} className="items-center">
                                <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
                            </Stack>
                        );
                    }

                    return (
                        <Stack orientation="horizontal" gap={2} className="items-center">
                            <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
                            <Text as="span" compact>
                                {item.name}
                            </Text>
                        </Stack>
                    );
                }}
                renderListItem={(item) =>
                    item ? (() => {
                        const indicator = getFileIndicator(item);
                        return (
                            <Stack orientation="horizontal" gap={2} className="items-center">
                                <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
                                <Text as="span" compact>
                                    {item.name}
                                </Text>
                            </Stack>
                        );
                    })() : (
                        <Stack orientation="horizontal" gap={2} className="items-center">
                            <IconIndicator kind="unknown" label="Файл не прикреплен" size={16} />
                        </Stack>
                    )
                }
            >
                <Input.Dropdown.Selected />
                <Input.Dropdown.List />
            </Input.Dropdown>
        </Stack>
    );
}


function OrderCardBody({ order, files, onOrderSaved }: OrderCardProps) {
    const isDirty = useDirtyStore<OrderCardDirtyState, boolean>((state) => state.isDirty);
    const workingCopy = useDirtyStore<OrderCardDirtyState, OrderCardDirtyState>((state) => state.workingCopy);
    const commit = useDirtyStore<OrderCardDirtyState, () => void>((state) => state.commit);
    const updateOrderMutation = useUpdateOrder();
    const analyseDetailsMutation = useAnalyseOrderDetails(order.id);
    const selectedFile = React.useMemo(
        () => files.find((file) => file.id === workingCopy.fileId) ?? null,
        [files, workingCopy.fileId]
    );
    const savedFile = React.useMemo(
        () => files.find((file) => file.id === order.fileId) ?? null,
        [files, order.fileId]
    );
    const shouldShowFileCard = selectedFile?.meta?.available === true;
    const canAnalyse = savedFile?.meta?.available === true;

    const handleSave = () => {
        updateOrderMutation.mutate(
            {
                id: order.id,
                fileId: workingCopy.fileId,
            },
            {
                onSuccess: (updatedOrder) => {
                    // Dirty state is confirmed only after successful server save.
                    commit();
                    onOrderSaved?.(updatedOrder);
                },
            }
        );
    };

    return (
        <Grid as="article" withRowGap className="border border-border">
            <Column span={16}>
                <Stack gap={2}>
                    <Stack orientation="horizontal" gap={2} className="items-center">
                        <Text.Heading as="h3" variant="compact-01">
                            Карточка заказа
                        </Text.Heading>
                        {isDirty ? (
                            <Text as="span" compact className="text-muted-foreground">
                                есть изменения
                            </Text>
                        ) : null}
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
            <Column span={16}>
                <OrderCardInfo order={order} />
            </Column>
            <Column span={16}>
                <OrderCardFile files={files} />
            </Column>
            {shouldShowFileCard ? (
                <Column span={16}>
                    <FileCard file={selectedFile} />
                </Column>
            ) : null}
            <Column span={16}>
                <Stack gap={2} className="border border-border p-3">
                    <Text.Heading as="h4" variant="compact-01">
                        Анализ
                    </Text.Heading>
                    <div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!canAnalyse || analyseDetailsMutation.isPending}
                            onClick={() => analyseDetailsMutation.mutate()}
                        >
                            {analyseDetailsMutation.isPending ? 'Запуск...' : 'Вывести требования'}
                        </Button>
                    </div>
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
            </Column>
            {updateOrderMutation.isError ? (
                <Column span={16}>
                    <Text as="p" compact className="text-destructive">
                        Ошибка сохранения: {getApiErrorMessage(updateOrderMutation.error)}
                    </Text>
                </Column>
            ) : null}
        </Grid>
    );
}

export function OrderCard({ order, files, onOrderSaved }: OrderCardProps) {
    return (
        <DirtyProvider<OrderCardDirtyState> id="order-card" initial={{ orderId: order.id, fileId: order.fileId ?? undefined }} key={order.id}>
            <OrderCardBody order={order} files={files} onOrderSaved={onOrderSaved} />
        </DirtyProvider>
    );
}
