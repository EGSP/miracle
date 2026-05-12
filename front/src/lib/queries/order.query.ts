import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { order } from "../generated";
import type { OrderQuery } from "@miracle/types";

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

export const useAnalyseOrderDetails = (orderId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => order.analyseOrderDetails({ id: orderId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] });
        },
    });
};

export const useClearAnalysedDetails = (orderId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => order.clearAnalysedDetails({ id: orderId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] });
        },
    });
};

export const useCanAnalyseOrderDetails = (orderId: string) => {
    return useQuery({
        queryKey: [...ORDER_ANALYSE_AVAILABILITY_QUERY_KEY, orderId] as const,
        queryFn: () => order.canAnalyseOrderDetails({ id: orderId }),
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
