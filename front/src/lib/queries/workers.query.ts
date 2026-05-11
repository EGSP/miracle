import { useQuery } from '@tanstack/react-query';
import type { WorkersQuery } from '@miracle/types';
import { workers } from '../generated';

export const workersQueryKey = (params: WorkersQuery) => ['workers', params] as const;

/** Список воркеров с фильтрацией по статусу и сортировкой. Обновляется каждые 3 секунды. */
export const useGetWorkers = (params: WorkersQuery = {}) => {
    return useQuery({
        queryKey: workersQueryKey(params),
        queryFn: () => workers.getWorkers(params),
        refetchInterval: 3_000,
    });
};
