import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductType } from '@miracle/types';
import { productType } from '../generated';

export const PRODUCT_TYPES_QUERY_KEY = ['product-types'] as const;

export const useProductTypes = () => {
    return useQuery({
        queryKey: PRODUCT_TYPES_QUERY_KEY,
        queryFn: () => productType.getProductTypes(),
    });
};

export const useCreateProductType = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: ProductType) => productType.createProductType(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PRODUCT_TYPES_QUERY_KEY });
        },
    });
};

export const useUpdateProductType = (id: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: Partial<Pick<ProductType, 'name' | 'synonyms'>>) =>
            productType.updateProductType({ id }, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PRODUCT_TYPES_QUERY_KEY });
        },
    });
};
