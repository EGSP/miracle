import type { TechnicalCondition, TechnicalConditionsQuery } from "@miracle/types"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { technicalConditions } from "../generated"
import { PRODUCT_TYPES_QUERY_KEY } from "./product-type.query"

function invalidateLinkedTechnicalConditions(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: PRODUCT_TYPES_QUERY_KEY,
    predicate: (query) => query.queryKey[2] === "linked-technical-conditions",
  })
}

export const TECHNICAL_CONDITIONS_ROOT_KEY = ["technical-conditions"] as const

export const technicalConditionsListKey = (filters?: { productTypeId?: string }) =>
  [...TECHNICAL_CONDITIONS_ROOT_KEY, "list", filters?.productTypeId ?? "all"] as const

export const useTechnicalConditions = (filters?: { productTypeId?: string }) => {
  const query: TechnicalConditionsQuery = filters?.productTypeId
    ? { productTypeId: filters.productTypeId }
    : {}

  return useQuery({
    queryKey: technicalConditionsListKey(filters),
    queryFn: () => technicalConditions.list(query),
  })
}

export const technicalConditionItemKey = (id: string | undefined) =>
  [...TECHNICAL_CONDITIONS_ROOT_KEY, "item", id ?? "none"] as const

export const useTechnicalCondition = (id: string | undefined) => {
  return useQuery({
    queryKey: technicalConditionItemKey(id),
    queryFn: () => {
      if (!id) throw new Error("TC id is required")
      return technicalConditions.getOne(id)
    },
    enabled: !!id,
  })
}

export const useCreateTechnicalCondition = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: TechnicalCondition) => technicalConditions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TECHNICAL_CONDITIONS_ROOT_KEY })
      invalidateLinkedTechnicalConditions(queryClient)
    },
  })
}

export const useReplaceTechnicalCondition = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: TechnicalCondition) => technicalConditions.replace(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TECHNICAL_CONDITIONS_ROOT_KEY })
      invalidateLinkedTechnicalConditions(queryClient)
    },
  })
}

export const useDeleteTechnicalCondition = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => technicalConditions.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TECHNICAL_CONDITIONS_ROOT_KEY })
      invalidateLinkedTechnicalConditions(queryClient)
    },
  })
}

export const useLinkedProductType = (tcId: string | undefined) => {
  return useQuery({
    queryKey: [...TECHNICAL_CONDITIONS_ROOT_KEY, "linked-product-type", tcId ?? "none"] as const,
    queryFn: () => {
      if (!tcId) throw new Error("TC id is required")
      return technicalConditions.getLinkedProductType(tcId)
    },
    enabled: !!tcId,
  })
}

