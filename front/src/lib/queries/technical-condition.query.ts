import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TechnicalCondition, TechnicalConditionsQuery } from '@miracle/types';
import { technicalCondition } from '../generated';

export const TECHNICAL_CONDITIONS_ROOT_KEY = ['technical-conditions'] as const;

export const technicalConditionsListKey = (filters?: { productTypeId?: string }) =>
    [...TECHNICAL_CONDITIONS_ROOT_KEY, 'list', filters?.productTypeId ?? 'all'] as const;

export const useTechnicalConditions = (filters?: { productTypeId?: string }) => {
    const query: TechnicalConditionsQuery = filters?.productTypeId
        ? { productTypeId: filters.productTypeId }
        : {};

    return useQuery({
        queryKey: technicalConditionsListKey(filters),
        queryFn: () => technicalCondition.getTechnicalConditions(query),
    });
};

export const useCreateTechnicalCondition = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: TechnicalCondition) => technicalCondition.createTechnicalCondition(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TECHNICAL_CONDITIONS_ROOT_KEY });
        },
    });
};

export const useReplaceTechnicalCondition = (id: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: TechnicalCondition) =>
            technicalCondition.replaceTechnicalCondition({ id }, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TECHNICAL_CONDITIONS_ROOT_KEY });
        },
    });
};
