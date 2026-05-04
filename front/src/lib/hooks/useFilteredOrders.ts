import { useMemo } from 'react';
import type { Order } from '@miracle/types';
import { useAuthContext } from '@/contexts/AuthContext';

export type OrderFilters = {
    myOrdersOnly: boolean;
    withFileOnly: boolean | undefined;
};

export function useFilteredOrders<T extends Order>(orders: T[] | undefined, filters: OrderFilters): T[] {
    const { userId } = useAuthContext();

    return useMemo(() => {
        if (!orders) {
            return [];
        }

        let result = orders;

        if (filters.myOrdersOnly) {
            result = result.filter((order) => order.authorId === userId);
        }

        if (filters.withFileOnly === true) {
            result = result.filter((order) => order.fileId !== undefined);
        } else if (filters.withFileOnly === false) {
            result = result.filter((order) => order.fileId === undefined);
        }

        return result;
    }, [orders, filters.myOrdersOnly, filters.withFileOnly, userId]);
}
