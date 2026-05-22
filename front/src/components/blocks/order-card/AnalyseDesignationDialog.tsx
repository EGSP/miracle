import { useMemo, useState } from 'react';
import { Stack, Text } from '@miracle/aramid';
import type { Order, Stored, TechnicalCondition } from '@miracle/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { InlineMutationNotification } from '@/components/ui/inline-mutation-notification';
import { useGetOrders, useAnalyseDesignation } from '@/lib/queries/order.query';
import { useTechnicalConditions } from '@/lib/queries/technical-condition.query';

/**
 * Диалог запуска анализа условного обозначения.
 *
 * Заказ предзаполняется текущим, но остаётся редактируемым (на случай вызова диалога
 * не из карточки заказа). Тех. условие пользователь выбирает руками — список ТУ
 * фильтруется по productTypeId выбранного заказа, если он определён.
 */
export function AnalyseDesignationDialog({
    orderId,
    trigger,
}: {
    orderId: string;
    trigger: React.ReactElement;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={trigger} />
            <DialogContent size="medium">
                <DialogHeader>
                    <DialogTitle>Анализ заказа — условное обозначение</DialogTitle>
                </DialogHeader>
                {open && (
                    <AnalyseDesignationForm
                        defaultOrderId={orderId}
                        onDone={() => setOpen(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function AnalyseDesignationForm({
    defaultOrderId,
    onDone,
}: {
    defaultOrderId: string;
    onDone: () => void;
}) {
    const [orderId, setOrderId] = useState<string | undefined>(defaultOrderId);
    const [tcId, setTcId] = useState<string | undefined>(undefined);

    const ordersQuery = useGetOrders({});
    const orders = ordersQuery.data ?? [];

    const selectedOrder = useMemo(
        () => orders.find((o) => o.id === orderId) ?? null,
        [orders, orderId],
    );

    // Фильтр ТУ по productTypeId выбранного заказа — если у заказа productTypeId не
    // определён, показываем все ТУ (конструктор должен иметь возможность выбрать вручную).
    const productTypeId = selectedOrder?.details?.productTypeId;
    const tcsQuery = useTechnicalConditions(
        productTypeId ? { productTypeId } : undefined,
    );
    const tcs = tcsQuery.data ?? [];

    const selectedTc = useMemo(
        () => tcs.find((t) => t.id === tcId) ?? null,
        [tcs, tcId],
    );

    const analyseMutation = useAnalyseDesignation();

    const canSubmit =
        !!orderId
        && !!tcId
        && !analyseMutation.isPending
        && !ordersQuery.isLoading
        && !tcsQuery.isLoading;

    const handleSubmit = () => {
        if (!orderId || !tcId) return;
        analyseMutation.mutate(
            { orderId, tcId },
            {
                onSuccess: () => {
                    onDone();
                },
            },
        );
    };

    return (
        <>
            <Stack gap={3}>
                <Text.Helper as="p">
                    Выберите заказ и ТУ — будет запущен анализ условного обозначения.
                    Список ТУ автоматически фильтруется по типу продукции заказа, если он определён.
                </Text.Helper>

                <Stack gap={1}>
                    <Input.Dropdown<Stored<Order>>
                        label="Заказ"
                        items={orders}
                        value={selectedOrder}
                        onChange={(next) => {
                            setOrderId(next?.id);
                            // Смена заказа → фильтр ТУ меняется → сбрасываем выбор ТУ
                            setTcId(undefined);
                        }}
                        getItemKey={(item) => item.id}
                        disabled={ordersQuery.isLoading || analyseMutation.isPending}
                        renderSelectedItem={(item) => (
                            <Text as="span" compact>
                                {item ? `Заказ ${item.id.slice(0, 8)}…` : 'Заказ не выбран'}
                            </Text>
                        )}
                        renderListItem={(item) => (
                            <Text as="span" compact>
                                {item ? `Заказ ${item.id.slice(0, 8)}…` : ''}
                            </Text>
                        )}
                    >
                        <Input.Dropdown.Selected />
                        <Input.Dropdown.List emptyText="Нет заказов" />
                    </Input.Dropdown>
                </Stack>

                <Stack gap={1}>
                    <Input.Dropdown<Stored<TechnicalCondition>>
                        label="Техническое условие"
                        items={tcs}
                        value={selectedTc}
                        onChange={(next) => setTcId(next?.id)}
                        getItemKey={(item) => item.id}
                        disabled={tcsQuery.isLoading || analyseMutation.isPending}
                        renderSelectedItem={(item) => (
                            <Text as="span" compact>
                                {getTcLabel(item)}
                            </Text>
                        )}
                        renderListItem={(item) => (
                            <Text as="span" compact>
                                {getTcLabel(item)}
                            </Text>
                        )}
                    >
                        <Input.Dropdown.Selected />
                        <Input.Dropdown.List
                            emptyText={
                                productTypeId
                                    ? 'Нет ТУ для этого типа продукции'
                                    : 'Нет доступных ТУ'
                            }
                        />
                    </Input.Dropdown>
                </Stack>

                <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
            </Stack>
            <DialogFooter>
                <Button
                    variant="tertiary"
                    label="Отмена"
                    onClick={onDone}
                    disabled={analyseMutation.isPending}
                />
                <Button
                    label={analyseMutation.isPending ? 'Запуск…' : 'Анализировать'}
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                />
            </DialogFooter>
        </>
    );
}

function getTcLabel(tc: Stored<TechnicalCondition> | null) {
    if (!tc) return 'ТУ не выбрано';
    if (!tc.name && !tc.lastProductTypeName) return 'У ТУ нет названия';
    return (tc?.name + ' ' + tc?.lastProductTypeName).trim();
}
