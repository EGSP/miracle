import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkersQuery } from '@miracle/types';
import { workers } from '../generated';
import { FILE_CONTENT_QUERY_KEY } from './file-content.query';
import { ORDERS_QUERY_KEY } from './order.query';

export const workersQueryKey = (params: WorkersQuery) => ['workers', params] as const;

/** Список воркеров с фильтрацией по статусу и сортировкой. Обновляется каждые 3 секунды. */
export const useGetWorkers = (params: WorkersQuery = {}) => {
    return useQuery({
        queryKey: workersQueryKey(params),
        queryFn: () => workers.getWorkers(params),
        refetchInterval: 3_000,
    });
};

/** POST `/workers/:id/apply-worker-data` — перенос сохранённого результата в file-content / заказ. */
export const useApplyWorkerData = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (workerId: string) => workers.applyWorkerData({ id: workerId }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['workers'] }),
                queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY }),
                queryClient.invalidateQueries({ queryKey: FILE_CONTENT_QUERY_KEY }),
            ]);
        },
    });
};
