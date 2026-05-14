import * as React from 'react';
import { Column, Grid, Text } from '@miracle/aramid';
import { DirtyGuardProvider, useGuardActions } from '@/contexts/dirty-state/DirtyGuardContext';
import { DraftAPI, useDraft } from '@/contexts/draft-api/DraftContext';
import { useUpdateOrder } from '@/lib/queries/order.query';
import { OrderCardActions } from './OrderCardActions';
import { OrderCardDetails } from './OrderCardDetails';
import { OrderCardFile } from './OrderCardFile';
import { OrderCardInfo } from './OrderCardInfo';
import type { OrderCardProps } from './OrderCard.types';
import type { FileWithMeta, Order, Stored } from '@miracle/types';
import { createContext, useContext } from 'react';

// ─── Контекст ───────────────────────────────────────────────────────────────

type OrderCardContextType = {
    order: Stored<Order>;
    files: FileWithMeta[];
    isSaving: boolean;
    saveError: Error | null;
    save: () => void;
} & DraftAPI<Order>;

const OrderCardContext = createContext<OrderCardContextType | null>(null);

export function useOrderCardContext(): OrderCardContextType {
    const ctx = useContext(OrderCardContext);
    if (!ctx) throw new Error('useOrderCardContext must be used within OrderCardProvider');
    return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────

type OrderCardProviderProps = React.PropsWithChildren<OrderCardProps>;

function OrderCardProvider({ order, files, onOrderSaved, children }: OrderCardProviderProps) {
    const draft = useDraft<Order>();
    const { commitAll } = useGuardActions();
    const mutation = useUpdateOrder();

    const save = () => {
        const result = draft.collect({ ...order });
        if (!result) return;
        mutation.mutate(
            { id: order.id, ...result },
            {
                onSuccess: (saved) => {
                    commitAll();
                    onOrderSaved(saved);
                },
            },
        );
    };

    return (
        <OrderCardContext.Provider
            value={{
                order,
                files,
                isSaving: mutation.isPending,
                saveError: mutation.error ?? null,
                save,
                ...draft,
            }}
        >
            {children}
        </OrderCardContext.Provider>
    );
}

// ─── Body ────────────────────────────────────────────────────────────────────

function OrderCardBody() {
    return (
        <Grid withRowGap className="border border-border">
            <Column span={16}>
                <Text.Heading as="h3" variant="compact-01">Карточка заказа</Text.Heading>
            </Column>
            <Column span={16}><OrderCardActions /></Column>
            <Column span={16}><OrderCardInfo /></Column>
            <Column span={16}><OrderCardFile /></Column>
            <Column span={16}><OrderCardDetails /></Column>
        </Grid>
    );
}

// ─── Экспорт ─────────────────────────────────────────────────────────────────

export function OrderCard({ order, files, onOrderSaved }: OrderCardProps) {
    return (
        <DirtyGuardProvider id="order-card" key={order.id}>
            <OrderCardProvider order={order} files={files} onOrderSaved={onOrderSaved}>
                <OrderCardBody />
            </OrderCardProvider>
        </DirtyGuardProvider>
    );
}
