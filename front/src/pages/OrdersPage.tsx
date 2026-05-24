import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ListOrdered, Plus } from 'lucide-react';
import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta, Order, Stored } from '@miracle/types';
import { Checkbox, type TriStateValue } from '@/components/ui/checkbox';
import { StructuredList, type ListDefinition, type StructuredListKey } from '@/components/ui/structured-list';
import { Button } from '@/components/ui/button';
import { OrderCard } from '@/components/blocks/order-card/OrderCard';
import { DirtyGuardProvider, useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useFilteredOrders } from '@/lib/hooks/useFilteredOrders';
import { useGetFiles } from '@/lib/queries/file.query';
import { useCreateOrder, useGetOrders } from '@/lib/queries/order.query';
import { useGetUser } from '@/lib/queries/user.query';

const COL_LIST = 6 as const;
const COL_CARD = 10 as const;

function formatCreatedAt(unixMs: number): string {
    return new Date(unixMs).toLocaleString();
}

function getFileIndicator(file: FileWithMeta | null): { kind: 'succeeded' | 'failed' | 'unknown'; label: string } {
    if (!file) return { kind: 'unknown', label: 'Файл не прикреплен' };
    if (file.meta?.available === true) return { kind: 'succeeded', label: 'Файл доступен' };
    if (file.meta?.available === false) return { kind: 'failed', label: 'Файл недоступен' };
    return { kind: 'unknown', label: 'Статус файла неизвестен' };
}

function OrderAuthorCell({ authorId }: { authorId: string }) {
    const { data: author } = useGetUser(authorId);
    return <Text as="span" compact>Автор: {author?.login ?? authorId}</Text>;
}

function OrderFileCell({ fileId }: { fileId?: string | null }) {
    const { data: files } = useGetFiles({ includeMeta: true });
    const file = fileId ? (files?.find((f) => f.id === fileId) ?? null) : null;
    const indicator = getFileIndicator(file);
    if (file) {
        return (
            <Stack orientation="horizontal" gap={2} className="min-w-0 items-center">
                <IconIndicator kind={indicator.kind} label={indicator.label} size={16} className="shrink-0" />
                <span className="min-w-0 truncate">
                    <Text.Label as="span">{file.name}</Text.Label>
                </span>
            </Stack>
        );
    }
    return <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />;
}

const orderListDefinition: ListDefinition<Stored<Order>> = {
    getKey: (order) => order.id,
    columns: [
        {
            key: 'icon',
            width: '32px',
            render: () => <ListOrdered className="size-4 shrink-0 text-muted-foreground" />,
        },
        {
            key: 'info',
            width: '1fr',
            rows: [
                {
                    key: 'date',
                    label: 'Дата',
                    weight: '1fr',
                    render: (order) => (
                        <Text.Label as="span">{formatCreatedAt(order.createdAt)}</Text.Label>
                    ),
                },
                {
                    key: 'author',
                    label: 'Автор',
                    weight: '1fr',
                    render: (order) => <OrderAuthorCell authorId={order.authorId} />,
                },
            ],
        },
        {
            key: 'file',
            label: 'Файл',
            width: '1fr',
            render: (order) => <OrderFileCell fileId={order.fileId} />,
        },
    ],
};

function OrdersPageContent() {
    const { orderId: orderIdParam } = useSearch({ from: '/orders' });
    const navigate = useNavigate({ from: '/orders' });
    const [selectedOrder, setSelectedOrder] = useState<Stored<Order> | null>(null);
    const [myOrdersOnly, setMyOrdersOnly] = useState(false);
    const [withFileOnly, setWithFileOnly] = useState<TriStateValue>(undefined);

    const { data: orders, isLoading: isOrdersLoading, error: ordersError } = useGetOrders();
    const createOrderMutation = useCreateOrder();
    const { data: files, isLoading: isFilesLoading, error: filesError } = useGetFiles({ includeMeta: true });
    const { isDirtyAnywhere } = useGuardState();

    const filesById = useMemo(
        () => new Map((files ?? []).map((file) => [file.id, file] as const)),
        [files],
    );

    const filteredOrders = useFilteredOrders(orders, { myOrdersOnly, withFileOnly }, filesById);

    const selected: StructuredListKey[] = useMemo(
        () => selectedOrder ? [selectedOrder.id] : [],
        [selectedOrder],
    );

    const handleCreateOrder = () => {
        createOrderMutation.mutate(undefined, {
            onSuccess: (createdOrder) => setSelectedOrder(createdOrder),
        });
    };

    const handleSelected = useCallback((keys: StructuredListKey[]) => {
        if (isDirtyAnywhere) return;
        const next = orders?.find((o) => o.id === keys[0]) ?? null;
        setSelectedOrder(next);
        void navigate({ search: (prev) => ({ ...prev, orderId: next?.id }) });
    }, [isDirtyAnywhere, orders, navigate]);

    // Синхронизация URL-параметра с выбором при загрузке заказов
    useEffect(() => {
        if (!orderIdParam || !orders) return;
        const match = orders.find((o) => o.id === orderIdParam);
        if (!match) return;
        setSelectedOrder((prev) => {
            if (prev?.id === match.id && prev.updatedAt === match.updatedAt) return prev;
            return match;
        });
    }, [orderIdParam, orders]);

    return (
        <Grid as="main" fullWidth withRowGap>
            <Column span={16}>
                <Text.Heading as="h1" variant="02">
                    Заказы
                </Text.Heading>
            </Column>

            <Column span={COL_LIST}>
                <Stack as="section" gap={4}>
                    <Stack orientation="horizontal" gap={3} className="flex-wrap items-center justify-between">
                        <Text.Heading as="h2" variant="compact-01">
                            Список заказов
                        </Text.Heading>
                        <Button
                            icon={<Plus />}
                            label={createOrderMutation.isPending ? 'Создание...' : 'Создать новый'}
                            onClick={handleCreateOrder}
                            disabled={createOrderMutation.isPending}
                        />
                    </Stack>
                    <Checkbox.Group label="Фильтры" direction="horizontal">
                        <Checkbox.Item label="Мои заказы" checked={myOrdersOnly} onChange={setMyOrdersOnly} />
                        <Checkbox.TristateItem label="С файлом" value={withFileOnly} onChange={setWithFileOnly} />
                    </Checkbox.Group>

                    {(isOrdersLoading || isFilesLoading) && <Text.Label as="p">Загрузка...</Text.Label>}
                    {(ordersError || filesError) && (
                        <Text.Label as="p">Ошибка: {ordersError?.message ?? filesError?.message}</Text.Label>
                    )}
                    {!isOrdersLoading && !ordersError && filteredOrders.length === 0 && (
                        <Text.Label as="p">Нет заказов</Text.Label>
                    )}
                    {!isOrdersLoading && !ordersError && filteredOrders.length > 0 && (
                        <StructuredList
                            definition={orderListDefinition}
                            items={filteredOrders}
                            selected={selected}
                            onSelected={handleSelected}
                        />
                    )}
                </Stack>
            </Column>

            <Column span={COL_CARD}>
                {selectedOrder ? (
                    <OrderCard
                        order={selectedOrder}
                        files={files ?? []}
                        onOrderSaved={(updatedOrder) => setSelectedOrder(updatedOrder)}
                    />
                ) : (
                    <Stack className="border border-border p-4">
                        <Text as="p" compact>
                            Выберите заказ в списке, чтобы открыть карточку.
                        </Text>
                    </Stack>
                )}
            </Column>
        </Grid>
    );
}

export default function OrdersPage() {
    return (
        <DirtyGuardProvider confirmMessage="Есть несохраненные изменения. Переключение заказа и переходы недоступны.">
            <OrdersPageContent />
        </DirtyGuardProvider>
    );
}
