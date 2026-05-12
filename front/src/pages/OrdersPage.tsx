import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ListOrdered, Plus } from 'lucide-react';
import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta, Order, Stored } from '@miracle/types';
import { Checkbox } from '@/components/ui/checkbox';
import { TriStateCheckbox, type TriStateValue } from '@/components/ui/derivation/tri-state-checkbox';
import { ListBox } from '@/components/ui/listbox';
import { Button } from '@/components/ui/button';
import { OrderCard } from '@/components/blocks/order-card/OrderCard';
import { DirtyGuardProvider, useGuard } from '@/contexts/dirty-state/DirtyGuardContext';
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

function OrderListItem({ order, file }: { order: Stored<Order>; file: FileWithMeta | null }) {
    const indicator = getFileIndicator(file);
    const { data: author } = useGetUser(order.authorId);

    return (
        <Stack
            orientation="horizontal"
            gap={3}
            className="min-w-0 items-center border border-border px-3 py-2.5"
        >
            <ListOrdered className="size-4 shrink-0" />
            <span className="shrink-0">
                <Text.Label as="span">{formatCreatedAt(order.createdAt)}</Text.Label>
            </span>
            <span className="min-w-0 flex-1 truncate">
                <Text as="span" compact>
                    Автор: {author?.login ?? order.authorId}
                </Text>
            </span>
            {file ? (
                <Stack orientation="horizontal" gap={2} className="min-w-0 items-center">
                    <IconIndicator
                        kind={indicator.kind}
                        label={indicator.label}
                        size={16}
                        className="shrink-0"
                    />
                    <span className="min-w-0 truncate">
                        <Text.Label as="span">{file.name}</Text.Label>
                    </span>
                </Stack>
            ) : (
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <IconIndicator kind={indicator.kind} label={indicator.label} size={16} className="shrink-0" />
                </Stack>
            )}
        </Stack>
    );
}

function OrdersPageContent() {
    const { orderId: orderIdParam } = useSearch({ from: '/orders' });
    const navigate = useNavigate({ from: '/orders' });
    const [selectedOrder, setSelectedOrder] = useState<Stored<Order> | null>(null);
    const [myOrdersOnly, setMyOrdersOnly] = useState(false);
    const [withFileOnly, setWithFileOnly] = useState<TriStateValue>(undefined);

    const { data: orders, isLoading: isOrdersLoading, error: ordersError } = useGetOrders();
    const createOrderMutation = useCreateOrder();
    const { data: files, isLoading: isFilesLoading, error: filesError } = useGetFiles({
        includeMeta: true,
    });
    const isDirtyAnywhere = useGuard((state) => state.dirtyIds.size > 0);

    const filesById = useMemo(() => {
        return new Map((files ?? []).map((file) => [file.id, file] as const));
    }, [files]);

    const filteredOrders = useFilteredOrders(orders, { myOrdersOnly, withFileOnly }, filesById);

    const handleCreateOrder = () => {
        createOrderMutation.mutate(undefined, {
            onSuccess: (createdOrder) => {
                setSelectedOrder(createdOrder);
            },
        });
    };

    const handleSelectedOrderChange = useCallback((next: Stored<Order> | null) => {
        if (isDirtyAnywhere) return;
        setSelectedOrder(next);
        void navigate({ search: (prev) => ({ ...prev, orderId: next?.id }) });
    }, [isDirtyAnywhere, navigate]);

    // Sync URL param → selection when orders load (без лишнего setState при том же снимке сущности)
    useEffect(() => {
        if (!orderIdParam || !orders) return;
        const match = orders.find((o) => o.id === orderIdParam);
        if (!match) return;
        setSelectedOrder((prev) => {
            if (prev?.id === match.id && prev.updatedAt === match.updatedAt) {
                return prev;
            }
            return match;
        });
    }, [orderIdParam, orders]);

    const getOrderListKey = useCallback((item: Stored<Order>) => item.id, []);


    return (
        <Grid
            as="main"
            fullWidth
            withRowGap
        >
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
                        <Button onClick={handleCreateOrder} disabled={createOrderMutation.isPending}>
                            <Plus />
                            {createOrderMutation.isPending ? 'Создание...' : 'Создать новый'}
                        </Button>
                    </Stack>
                    <Stack
                        orientation="horizontal"
                        gap={4}
                        className="flex-wrap items-center border border-border p-2"
                    >
                        <label className="inline-flex items-center gap-2">
                            <Checkbox checked={myOrdersOnly} onCheckedChange={(checked) => setMyOrdersOnly(checked === true)} />
                            <Text.Label as="span">Мои заказы</Text.Label>
                        </label>
                        <TriStateCheckbox label="С файлом" value={withFileOnly} onChange={setWithFileOnly} />
                    </Stack>

                    {(isOrdersLoading || isFilesLoading) && <Text.Label as="p">Загрузка...</Text.Label>}
                    {(ordersError || filesError) && (
                        <Text.Label as="p">
                            Ошибка: {ordersError?.message ?? filesError?.message}
                        </Text.Label>
                    )}
                    {!isOrdersLoading && !ordersError && filteredOrders.length === 0 && (
                        <Text.Label as="p">Нет заказов</Text.Label>
                    )}
                    {!isOrdersLoading && !ordersError && filteredOrders.length > 0 && (
                        <ListBox
                            items={filteredOrders}
                            value={selectedOrder}
                            onChange={handleSelectedOrderChange}
                            getKey={getOrderListKey}
                            className="flex flex-col gap-1 outline-none"
                        >
                            <ListBox.Items>
                                {(item: Stored<Order>, index) => (
                                    <ListBox.Item
                                        item={item}
                                        index={index}
                                        className="cursor-default data-active:bg-muted/60 data-selected:border-primary data-selected:bg-primary/5"
                                    >
                                        <OrderListItem order={item} file={item.fileId ? filesById.get(item.fileId) ?? null : null} />
                                    </ListBox.Item>
                                )}
                            </ListBox.Items>
                        </ListBox>
                    )}
                </Stack>
            </Column>

            <Column span={COL_CARD}>
                {selectedOrder ? (
                    <OrderCard
                        order={selectedOrder}
                        files={files ?? []}
                        onOrderSaved={(updatedOrder) => {
                            setSelectedOrder(updatedOrder);
                        }}
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
