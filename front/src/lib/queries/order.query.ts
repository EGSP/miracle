import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { order } from "../generated";
import type { DesignationWorkerInput, OrderQuery } from "@miracle/types";

export const ORDERS_QUERY_KEY = ["orders"] as const;
export const ORDER_ANALYSE_AVAILABILITY_QUERY_KEY = ["order-analyse-availability"] as const;

export const useGetOrders = (query: OrderQuery = {}) => {
    return useQuery({
        queryKey: [...ORDERS_QUERY_KEY, query.id, query.authorId, query.fileId] as const,
        queryFn: () => order.getOrders(query),
    });
};

export const useCreateOrder = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => order.createOrder({}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
        },
    });
};

export const useAnalyseOrderDetails = (orderId: string | undefined) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ forceReanalyse = false }: { forceReanalyse?: boolean } = {}) => {
            if (!orderId) throw new Error('Order ID is required');
            return order.analyseOrderDetails({ id: orderId }, { forceReanalyse });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] });
        },
    });
};

export const useClearAnalysedDetails = (orderId: string | undefined) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => {
            if (!orderId) throw new Error('Order ID is required');
            return order.clearAnalysedDetails({ id: orderId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] });
        },
    });
};

export const useCanAnalyseOrderDetails = (orderId: string | undefined) => {
    return useQuery({
        queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] as const,
        queryFn: () => {
            if (!orderId) throw new Error('Order ID is required');
            return order.canAnalyseOrderDetails({ id: orderId });
        },
    });
};

export const useAnalyseDesignation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: DesignationWorkerInput) => order.analyseDesignation(input),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            queryClient.invalidateQueries({
                queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, variables.orderId],
            });
        },
    });
};

export const useUpdateOrder = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof order.updateOrder>[1]) =>
            order.updateOrder({ id }, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ORDER_ANALYSE_AVAILABILITY_QUERY_KEY });
        },
    });
};
