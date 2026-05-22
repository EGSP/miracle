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

export const technicalConditionItemKey = (id: string | undefined) =>
    [...TECHNICAL_CONDITIONS_ROOT_KEY, 'item', id ?? 'none'] as const;

export const useTechnicalCondition = (id: string | undefined) => {
    return useQuery({
        queryKey: technicalConditionItemKey(id),
        queryFn: () => {
            if (!id) throw new Error('TC id is required');
            return technicalCondition.getTechnicalCondition({ id });
        },
        enabled: !!id,
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

export const useExtractTcDetails = (id: string) => {
    return useMutation({
        mutationFn: () => technicalCondition.extractTcDetails({ id }),
    });
};
