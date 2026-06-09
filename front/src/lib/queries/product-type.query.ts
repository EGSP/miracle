import type { ProductType } from "@miracle/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { productTypes } from "../generated"

export const PRODUCT_TYPES_QUERY_KEY = ["product-types"] as const

export type LinkedTechnicalConditionRef = { id: string; name: string | null }

export const linkedTechnicalConditionsKey = (productTypeId: string) =>
  [...PRODUCT_TYPES_QUERY_KEY, productTypeId, "linked-technical-conditions"] as const

export function linkedTechnicalConditionLabel(tc: LinkedTechnicalConditionRef): string {
  const trimmed = tc.name?.trim()
  return trimmed ? trimmed : tc.id
}

export const useLinkedTechnicalConditions = (productTypeId: string) => {
  return useQuery({
    queryKey: linkedTechnicalConditionsKey(productTypeId),
    queryFn: () => productTypes.getLinkedTechnicalConditions(productTypeId),
  })
}

export const useProductTypes = () => {
  return useQuery({
    queryKey: PRODUCT_TYPES_QUERY_KEY,
    queryFn: () => productTypes.list(),
  })
}

export const useCreateProductType = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ProductType) => productTypes.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_TYPES_QUERY_KEY })
    },
  })
}

export const useUpdateProductType = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Partial<Pick<ProductType, "name" | "synonyms">>) =>
      productTypes.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_TYPES_QUERY_KEY })
    },
  })
}

export const useSoftDeleteProductType = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => productTypes.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_TYPES_QUERY_KEY })
    },
  })
}
