import type { FileWithMeta, Order, Stored } from '@miracle/types';

export type OrderCardProps = {
    order: Stored<Order>;
    files: FileWithMeta[];
    onOrderSaved: (order: Stored<Order>) => void;
};

export type OrderCardDirtyState = {
    orderId: string;
    fileId?: string;
};
