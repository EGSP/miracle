import * as React from 'react';
import { Column, Grid, Stack, Text } from '@miracle/aramid';
import { Button } from '@/components/ui/button';
import { FileCard } from '@/components/blocks/FileCard';
import { DirtyGuardProvider, useGuardActions, useGuardState } from '@/contexts/dirty-state/DirtyGuardContext';
import { useField, type FieldReturn } from '@/contexts/dirty-state/useField';
import { DraftAPI, useContribute, useDraft } from '@/contexts/draft-api/DraftContext';
import { getApiErrorMessage } from '@/lib/api';
import { useUpdateOrder } from '@/lib/queries/order.query';
import { OrderCardAnalyse } from './OrderCardAnalyse';
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
    /** Поле выбора файла — объявлено здесь т.к. нужно нескольким компонентам */
    fileIdField: FieldReturn<string | undefined>;
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

    // fileId — общее поле: нужно и OrderCardFile (рендер), и Body (поиск файла)
    const fileIdField = useField<string | undefined>('fileId', order.fileId ?? undefined);

    useContribute(draft.contribute, 'fileId', (o) => ({
        ...o,
        fileId: fileIdField.value ?? null,
    }));

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
                fileIdField,
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
    const { order, files, fileIdField, isSaving, save, saveError } = useOrderCardContext();
    const { isDirtyAnywhere } = useGuardState();

    const selectedFile = React.useMemo(
        () => files.find((f) => f.id === fileIdField.value) ?? null,
        [files, fileIdField.value],
    );
    const shouldShowFileCard = selectedFile?.meta?.available === true;

    return (
        <Grid as="article" withRowGap className="border border-border">
            <Column span={16}>
                <Stack gap={2}>
                    <Stack orientation="horizontal" gap={2} className="items-center">
                        <Text.Heading as="h3" variant="compact-01">Карточка заказа</Text.Heading>
                        {isDirtyAnywhere && (
                            <Text as="span" compact className="text-muted-foreground">
                                есть изменения
                            </Text>
                        )}
                    </Stack>
                    <div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!isDirtyAnywhere || isSaving}
                            onClick={save}
                        >
                            {isSaving ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                    </div>
                </Stack>
            </Column>

            <Column span={16}><OrderCardInfo order={order} /></Column>
            <Column span={16}><OrderCardFile /></Column>

            {shouldShowFileCard && (
                <Column span={16}>
                    <FileCard key={selectedFile!.id} file={selectedFile!} />
                </Column>
            )}

            <Column span={16}><OrderCardDetails /></Column>
            <Column span={16}><OrderCardAnalyse /></Column>

            {saveError && (
                <Column span={16}>
                    <Text as="p" compact className="text-destructive">
                        Ошибка сохранения: {getApiErrorMessage(saveError)}
                    </Text>
                </Column>
            )}
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
