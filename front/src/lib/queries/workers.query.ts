import { useQuery } from '@tanstack/react-query';
import { workers } from '../generated';

export const WORKERS_QUERY_KEY = ['workers'] as const;

/** Список всех воркеров, обновляется каждые 3 секунды */
export const useGetWorkers = () => {
    return useQuery({
        queryKey: WORKERS_QUERY_KEY,
        queryFn: () => workers.getWorkers({}),
        refetchInterval: 3_000,
    });
};
